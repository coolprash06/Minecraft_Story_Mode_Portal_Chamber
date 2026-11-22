/**
 * Post stack: [warp distortion, only while entering a portal] → bloom (only HDR emitters exceed
 * the threshold: flames, lantern glass, portals) → ACES filmic → colour grade (cool shadows, warm
 * highlights, a touch of extra saturation) → vignette → warp tint (entry pulse + whiteout) → SMAA →
 * faint grain. The composer disables the renderer's own tone mapping, so ACES is applied exactly
 * once, here.
 *
 * The warp distortion samples the frame at shifted UVs, so it needs a pass of its own. That pass is
 * switched off whenever the warp is idle (it only runs during the jump, plus a few warm-up frames
 * behind the loader so its shader is compiled before the first click). The tint is plain colour
 * maths and merges into the main pass for free.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, BloomEffect, Effect, EffectAttribute, EffectPass, ToneMappingMode } from 'postprocessing'
import { Color, Uniform, Vector3 } from 'three'
import { postFx, warpFx } from '../gfx/portalFx'
import { OFF } from '../lib/debug'
import { appStore, useApp } from '../state/store'

const gradeFrag = /* glsl */ `
  uniform vec3 uShadowTint;
  uniform vec3 uHighTint;
  uniform float uSaturation;
  uniform float uContrast;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSaturation);
    // split toning
    c += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l)) + uHighTint * smoothstep(0.45, 1.0, l);
    // gentle S-curve around mid-grey
    c = clamp(c, 0.0, 1.0);
    c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
    outputColor = vec4(c, inputColor.a);
  }
`

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFrag, {
      uniforms: new Map<string, Uniform>([
        ['uShadowTint', new Uniform(new Vector3(-0.006, 0.0, 0.018))],
        ['uHighTint', new Uniform(new Vector3(0.025, 0.008, -0.02))],
        ['uSaturation', new Uniform(1.12)],
        ['uContrast', new Uniform(0.18)],
      ]),
    })
  }
}

const tintFrag = /* glsl */ `
  uniform float uPulse;
  uniform float uDim;
  uniform float uFlash;
  uniform vec3 uColor;
  uniform vec3 uFlashColor;
  uniform float uAspect;
  uniform float uT;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 col = inputColor.rgb * (1.0 - uDim);
    if (uPulse > 0.0) {
      vec2 c = uv - 0.5;
      c.x *= uAspect;
      float r = length(c);
      float pulse = uPulse * (0.65 + 0.35 * sin(uT * 5.5));
      col = mix(col, col * 0.45 + uColor * 0.55, smoothstep(0.42, 1.0, r) * pulse);
    }
    col = mix(col, uFlashColor, uFlash);
    outputColor = vec4(col, inputColor.a);
  }
`

/** Portal entry: a pulsing vignette in the portal's colour and the whiteout; the extinguish dimming (warpFx). */
export class WarpTintEffect extends Effect {
  constructor() {
    super('WarpTintEffect', tintFrag, {
      uniforms: new Map<string, Uniform>([
        ['uPulse', new Uniform(0)],
        ['uDim', new Uniform(0)],
        ['uFlash', new Uniform(0)],
        ['uColor', new Uniform(new Color())],
        ['uFlashColor', new Uniform(new Color())],
        ['uAspect', new Uniform(1)],
        ['uT', new Uniform(0)],
      ]),
    })
  }
}

const distortFrag = /* glsl */ `
  uniform float uWarp;
  uniform float uFringe;
  uniform float uAspect;
  uniform float uT;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 c = uv - 0.5;
    c.x *= uAspect;
    float r = length(c);
    // swirl, strongest at the edges, with a slow wobble
    float a = uWarp * 0.14 * r * sin(uT * 2.3 + r * 6.0);
    vec2 w = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
    w.x /= uAspect;
    vec2 q = 0.5 + w + uWarp * 0.004 * vec2(sin(uT * 3.0 + uv.y * 20.0), cos(uT * 2.6 + uv.x * 18.0));
    vec3 col = texture2D(inputBuffer, q).rgb;
    if (uFringe > 0.0) {
      vec2 off = c * 0.008 * uWarp * uFringe;
      off.x /= uAspect;
      col.r = texture2D(inputBuffer, q + off).r;
      col.b = texture2D(inputBuffer, q - off).b;
    }
    outputColor = vec4(col, inputColor.a);
  }
`

/** Portal entry: swirl distortion + chromatic fringe (warpFx.warp). Runs in its own, togglable pass. */
export class WarpDistortEffect extends Effect {
  constructor() {
    super('WarpDistortEffect', distortFrag, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uWarp', new Uniform(0)],
        ['uFringe', new Uniform(1)],
        ['uAspect', new Uniform(1)],
        ['uT', new Uniform(0)],
      ]),
    })
  }
}

/** Frames the distortion pass runs after the scene is ready, so its program is compiled up front. */
const WARP_WARMUP_FRAMES = 4

/** ?off=post (debug knob). */
export const NO_POST = new URLSearchParams(window.location.search).get('off')?.split(',').includes('post') ?? false

export function Effects() {
  const high = useApp((s) => s.quality) === 'high'
  const camera = useThree((s) => s.camera)
  const grade = useMemo(() => new GradeEffect(), [])
  const tint = useMemo(() => new WarpTintEffect(), [])
  const { distort, distortPass } = useMemo(() => {
    const distort = new WarpDistortEffect()
    return { distort, distortPass: new EffectPass(camera, distort) }
  }, [camera])
  useEffect(() => () => distortPass.dispose(), [distortPass])
  const bloom = useRef<BloomEffect>(null)
  const baseBloom = high ? 1.15 : 0.9
  const warm = useRef(0)

  useFrame(({ size, clock }) => {
    const aspect = size.width / Math.max(1, size.height)
    const t = clock.elapsedTime
    if (bloom.current) bloom.current.intensity = baseBloom + postFx.bloom
    const tu = tint.uniforms
    tu.get('uPulse')!.value = warpFx.pulse
    tu.get('uDim')!.value = warpFx.dim
    tu.get('uFlash')!.value = warpFx.flash
    ;(tu.get('uColor')!.value as Color).set(warpFx.color)
    ;(tu.get('uFlashColor')!.value as Color).set(warpFx.flashColor)
    tu.get('uAspect')!.value = aspect
    tu.get('uT')!.value = t
    const du = distort.uniforms
    du.get('uWarp')!.value = warpFx.warp
    du.get('uFringe')!.value = high ? 1 : 0
    du.get('uAspect')!.value = aspect
    du.get('uT')!.value = t
    if (appStore.get().sceneReady && warm.current < WARP_WARMUP_FRAMES) warm.current++
    distortPass.enabled = warm.current < WARP_WARMUP_FRAMES || warpFx.warp > 0.001
  })

  return (
    <EffectComposer multisampling={0} enableNormalPass={false} enabled={!NO_POST}>
      <primitive object={distortPass} dispose={null} />
      {OFF.has('bloom') ? <></> : <Bloom ref={bloom} mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.25} intensity={baseBloom} radius={0.72} />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={grade} dispose={null} />
      <Vignette offset={0.28} darkness={0.72} />
      <primitive object={tint} dispose={null} />
      {high ? <SMAA /> : <></>}
      <Noise blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.04} />
    </EffectComposer>
  )
}
