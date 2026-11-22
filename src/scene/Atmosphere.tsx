/**
 * Drifting dust: a box of motes that wraps around the camera (so the whole hall always has dust
 * without simulating 110 m of it). Motes are faint, warm, and pick up a little brightness near
 * the floor and in the upper air where light pools.
 */
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three'
import { FOG_DENSITY } from '../config/theme'
import { useApp } from '../state/store'

const BOX = new Vector3(14, 15, 36)

export function Atmosphere() {
  const high = useApp((s) => s.quality) === 'high'
  const count = high ? 900 : 380
  const { geo, mat } = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * BOX.x
      pos[i * 3 + 1] = Math.random() * BOX.y
      pos[i * 3 + 2] = Math.random() * BOX.z
      seed[i] = Math.random()
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 1))
    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 800 },
        uOrigin: { value: new Vector3() },
        uBox: { value: BOX },
        uColor: { value: new Color('#ffd9a8') },
        uFog: { value: FOG_DENSITY },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uScale; uniform vec3 uOrigin; uniform vec3 uBox; uniform float uFog;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.11 + aSeed * 30.0) * 0.6, uTime * (0.03 + aSeed * 0.04), uTime * 0.05);
          // wrap into a box centred on the camera (floor-aligned in y)
          vec3 lo = vec3(uOrigin.x - uBox.x * 0.5, 0.0, uOrigin.z - uBox.z * 0.5);
          p = lo + mod(p - lo, uBox);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = (0.012 + 0.02 * fract(aSeed * 7.13)) * uScale / -mv.z;
          gl_PointSize = max(size, 1.0);
          float twinkle = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.5 + aSeed) + aSeed * 40.0));
          // fade at the box edges so wrapping never shows
          vec3 e = abs((p - lo) / uBox - 0.5) * 2.0;
          float edge = (1.0 - smoothstep(0.75, 1.0, e.x)) * (1.0 - smoothstep(0.7, 1.0, e.z));
          float f = uFog * -mv.z;
          vAlpha = twinkle * edge * min(size, 1.0) * exp(-f * f) * 0.5;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, d) * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    })
    return { geo: g, mat }
  }, [count])

  useFrame(({ gl, camera }, dt) => {
    mat.uniforms.uTime.value += dt
    mat.uniforms.uOrigin.value.copy(camera.position)
    mat.uniforms.uScale.value = gl.domElement.height / (2 * Math.tan((((camera as PerspectiveCamera).fov ?? 60) * Math.PI) / 360))
  })

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />
}
