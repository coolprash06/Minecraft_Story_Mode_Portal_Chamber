/**
 * Post stack: bloom (only HDR emitters exceed the threshold: flames, lantern glass, portals) →
 * ACES filmic → colour grade (cool shadows, warm highlights, a touch of extra saturation) →
 * vignette → SMAA → faint grain. The composer disables the renderer's own tone mapping, so ACES
 * is applied exactly once, here.
 */
import { useMemo } from 'react'
import { Bloom, EffectComposer, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, Effect, ToneMappingMode } from 'postprocessing'
import { Uniform, Vector3 } from 'three'
import { useApp } from '../state/store'

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

/** ?off=post (debug knob). */
export const NO_POST = new URLSearchParams(window.location.search).get('off')?.split(',').includes('post') ?? false

export function Effects() {
  const high = useApp((s) => s.quality) === 'high'
  const grade = useMemo(() => new GradeEffect(), [])
  return (
    <EffectComposer multisampling={0} enableNormalPass={false} enabled={!NO_POST}>
      <Bloom mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.25} intensity={high ? 1.15 : 0.9} radius={0.72} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={grade} dispose={null} />
      <Vignette offset={0.28} darkness={0.72} />
      {high ? <SMAA /> : <></>}
      <Noise blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.04} />
    </EffectComposer>
  )
}
