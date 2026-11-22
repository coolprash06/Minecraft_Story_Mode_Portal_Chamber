/**
 * Torch fire, fully on the GPU:
 *  • a pixel-art flame billboard per torch (9 × 12 "pixels", animated at a stepped 10 fps like a
 *    sprite sheet, so it stays crisp and voxel-y),
 *  • a soft additive halo for the glow in the air around it,
 *  • embers that rise, drift and wink out.
 * Brightness follows each torch's level × flicker from the light field (one uniform array).
 */
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, InstancedBufferAttribute, InstancedBufferGeometry, PlaneGeometry, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three'
import { FOG_DENSITY } from '../config/theme'
import { lightField } from '../gfx/lightField'
import { useApp } from '../state/store'
import { hall } from '../world/layout'

const N = hall.torches.length
/** Shared: per-torch brightness (level × flicker), written once per frame. */
const torchLevel = { value: new Float32Array(N) }
const time = { value: 0 }
const fog = { value: FOG_DENSITY }
const pointScale = { value: 800 }

const flamePos = hall.torches.map((t) => new Vector3(...t.position).add(new Vector3(0, 0.05, 0)))

const COMMON = /* glsl */ `
  uniform float uLevel[${N}];
  uniform float uTime;
  uniform float uFog;
  float fogFactor(float depth) { float f = uFog * depth; return exp(-f * f); }
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`

function instanced(base: BufferGeometry) {
  const g = new InstancedBufferGeometry().copy(base as InstancedBufferGeometry)
  const pos = new Float32Array(N * 3)
  const seed = new Float32Array(N)
  const idx = new Float32Array(N)
  flamePos.forEach((p, i) => {
    p.toArray(pos, i * 3)
    seed[i] = (i * 0.618) % 1
    idx[i] = i
  })
  g.setAttribute('aPos', new InstancedBufferAttribute(pos, 3))
  g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1))
  g.setAttribute('aIdx', new InstancedBufferAttribute(idx, 1))
  g.instanceCount = N
  return g
}

const flameMaterial = () =>
  new ShaderMaterial({
    uniforms: { uLevel: torchLevel, uTime: time, uFog: fog },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec3 aPos; attribute float aSeed; attribute float aIdx;
      varying vec2 vUv; varying float vSeed; varying float vLevel; varying float vFog;
      void main() {
        vUv = uv; vSeed = aSeed; vLevel = uLevel[int(aIdx)];
        vec4 mv = viewMatrix * vec4(aPos, 1.0);
        float s = 0.55 + 0.45 * smoothstep(0.05, 0.6, vLevel);
        mv.xy += position.xy * vec2(0.34, 0.46) * s;
        vFog = fogFactor(-mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec2 vUv; varying float vSeed; varying float vLevel; varying float vFog;
      void main() {
        if (vLevel < 0.03) discard;
        vec2 grid = vec2(9.0, 12.0);
        vec2 cell = floor(vUv * grid);
        vec2 p = (cell + 0.5) / grid;
        float frame = floor(uTime * 10.0 + vSeed * 37.0);
        float n = hash12(cell + frame * 13.1 + vSeed * 91.0);
        float sway = sin(frame * 0.7 + vSeed * 6.0) * 0.07 * p.y;
        float x = abs(p.x - 0.5 - sway);
        float width = (1.0 - p.y) * 0.46 + 0.04;
        float shape = width - x + (n - 0.5) * 0.11 - p.y * 0.05;
        if (shape < 0.0) discard;
        float heat = clamp(shape * 5.0 + (1.0 - p.y) * 0.55 - 0.2, 0.0, 1.0);
        vec3 col = mix(vec3(0.95, 0.18, 0.02), vec3(1.0, 0.55, 0.08), smoothstep(0.1, 0.45, heat));
        col = mix(col, vec3(1.0, 0.92, 0.6), smoothstep(0.6, 0.95, heat));
        gl_FragColor = vec4(col * (3.2 + heat * 2.0) * vLevel * vFog, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })

const haloMaterial = () =>
  new ShaderMaterial({
    uniforms: { uLevel: torchLevel, uTime: time, uFog: fog },
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec3 aPos; attribute float aSeed; attribute float aIdx;
      varying vec2 vUv; varying float vLevel; varying float vFog;
      void main() {
        vUv = uv; vLevel = uLevel[int(aIdx)];
        vec4 mv = viewMatrix * vec4(aPos + vec3(0.0, 0.08, 0.0), 1.0);
        mv.xy += position.xy * 1.9;
        // pull towards the camera a little so the halo isn't clipped by the pillar behind it
        mv.xyz += normalize(-mv.xyz) * 0.35;
        vFog = fogFactor(-mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec2 vUv; varying float vLevel; varying float vFog;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = pow(max(1.0 - r, 0.0), 2.4);
        if (a < 0.002) discard;
        gl_FragColor = vec4(vec3(1.0, 0.5, 0.16) * a * 0.32 * vLevel * vFog, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })

/** Embers: EMBERS per torch, each on its own looping life, rising with a lazy wobble. */
const EMBERS = 6
function emberGeometry() {
  const g = new BufferGeometry()
  const count = N * EMBERS
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const idx = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const t = Math.floor(i / EMBERS)
    flamePos[t].toArray(pos, i * 3)
    seed[i] = Math.random()
    idx[i] = t
  }
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new BufferAttribute(seed, 1))
  g.setAttribute('aIdx', new BufferAttribute(idx, 1))
  return g
}

const emberMaterial = () =>
  new ShaderMaterial({
    uniforms: { uLevel: torchLevel, uTime: time, uFog: fog, uScale: pointScale },
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform float uScale;
      attribute float aSeed; attribute float aIdx;
      varying float vAlpha; varying float vHeat;
      void main() {
        float level = uLevel[int(aIdx)];
        float speed = 0.28 + aSeed * 0.3;
        float life = fract(uTime * speed + aSeed * 17.0);
        vec3 p = position;
        p.y += 0.1 + life * (1.1 + aSeed * 0.8);
        p.x += sin(uTime * 1.7 + aSeed * 40.0) * 0.12 * life;
        p.z += cos(uTime * 1.3 + aSeed * 23.0) * 0.12 * life;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, (0.035 * uScale) / -mv.z);
        float wink = step(0.25, fract(aSeed * 7.0 + uTime * (2.0 + aSeed * 3.0)));
        vAlpha = (1.0 - life) * smoothstep(0.0, 0.08, life) * level * (0.55 + 0.45 * wink) * fogFactor(-mv.z);
        vHeat = 1.0 - life;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha; varying float vHeat;
      void main() {
        if (vAlpha < 0.01) discard;
        vec3 col = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.75, 0.3), vHeat);
        gl_FragColor = vec4(col * 4.0 * vAlpha, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })

export function Flames() {
  const high = useApp((s) => s.quality) === 'high'
  const { flameGeo, haloGeo, embers, flameMat, haloMat, emberMat } = useMemo(() => {
    const quad = new PlaneGeometry(1, 1).translate(0, 0.42, 0)
    const halo = new PlaneGeometry(1, 1)
    return {
      flameGeo: instanced(quad),
      haloGeo: instanced(halo),
      embers: emberGeometry(),
      flameMat: flameMaterial(),
      haloMat: haloMaterial(),
      emberMat: emberMaterial(),
    }
  }, [])

  useFrame(({ gl, camera }, dt) => {
    time.value += dt
    for (let i = 0; i < N; i++) {
      const s = lightField.sources[i]
      const lv = s.level * s.level * (3 - 2 * s.level)
      torchLevel.value[i] = lv * s.flicker
    }
    pointScale.value = gl.domElement.height / (2 * Math.tan((((camera as PerspectiveCamera).fov ?? 60) * Math.PI) / 360))
  })

  return (
    <group name="flames">
      <mesh geometry={haloGeo} material={haloMat} frustumCulled={false} renderOrder={2} />
      <mesh geometry={flameGeo} material={flameMat} frustumCulled={false} renderOrder={3} />
      {high && <points geometry={embers} material={emberMat} frustumCulled={false} renderOrder={4} />}
    </group>
  )
}
