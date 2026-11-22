/**
 * Portal surfaces and their particles. All 18 share one instanced draw:
 *  • the surface is an animated swirl of layered noise in the portal's colour, quantised to the
 *    block grid (16 px per block) and to a few tones, so it reads as moving pixel art;
 *  • `level` (0..1, from the light field's fade) dissolves the surface in from the frame edges,
 *    so lighting a portal (phase 4) and ?lit=all use the same path;
 *  • soft square motes drift out of each lit portal into the hall and fade.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import { PORTAL_COLORS } from '../config/portals'
import { FOG_DENSITY } from '../config/theme'
import { lightField } from '../gfx/lightField'
import { hall } from '../world/layout'

const P = hall.portals.length
/** Per-portal on-level, written by the light field each frame (shared with the frame glow). */
const portalLevel = lightField.portalLevels
const time = { value: 0 }
const pointScale = { value: 800 }
/** Light-field source index of each portal. */
const sourceOf = hall.portals.map((p) => lightField.sources.find((s) => s.kind === 'portal' && s.owner === p.id)!.index)

const NOISE = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`

function surfaceMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: time, uFog: { value: FOG_DENSITY } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aLevel; attribute float aSeed;
      uniform float uFog;
      varying vec2 vUv; varying vec3 vColor; varying float vLevel; varying float vSeed; varying float vFog;
      void main() {
        vUv = uv; vColor = aColor; vLevel = aLevel; vSeed = aSeed;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        float f = uFog * -mv.z; vFog = exp(-f * f);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime;
      varying vec2 vUv; varying vec3 vColor; varying float vLevel; varying float vSeed; varying float vFog;
      void main() {
        if (vLevel < 0.002) discard;
        // 3 × 4 blocks → 48 × 64 pixels
        vec2 grid = vec2(48.0, 64.0);
        vec2 cell = floor(vUv * grid);
        vec2 uv = (cell + 0.5) / grid;
        vec2 p = (uv - 0.5) * vec2(3.0, 4.0);

        // reveal: grows in from the frame edges as level rises
        float edge = min(min(uv.x, 1.0 - uv.x) * 3.0, min(uv.y, 1.0 - uv.y) * 4.0);
        float reveal = vLevel * 2.6 - edge + (hash12(cell + vSeed * 50.0) - 0.5) * 0.5;
        if (reveal < 0.0) discard;

        float t = uTime * 0.55 + vSeed * 20.0;
        // domain-warped logarithmic spiral: continuous arms that turn and drift, broken up by noise
        vec2 w = p + (vec2(fbm(p * 0.8 + vec2(t * 0.15, 0.0)), fbm(p * 0.8 + vec2(5.2, -t * 0.12))) - 0.5) * 1.1;
        float r = length(w) + 0.001;
        float a = atan(w.y, w.x);
        float arms = sin(2.0 * a + 4.2 * log(r + 0.25) - t * 2.4);
        float swirl = 0.5 + 0.5 * arms;
        float grain = fbm(w * 1.6 - vec2(0.0, t * 0.5));
        float v = clamp(mix(swirl, grain, 0.38) + (1.0 - smoothstep(0.0, 1.4, r)) * 0.15, 0.0, 1.0);
        v = floor(v * 5.0 + 0.5) / 5.0;           // posterise
        float sparkle = step(0.994, hash12(cell + floor(uTime * 6.0) * 7.0 + vSeed));

        // deep tones lean towards violet, highlights stay saturated (no white-out)
        vec3 deep = mix(vColor, vec3(0.35, 0.1, 0.6), 0.35) * 0.18;
        vec3 mid = vColor * 0.75;
        vec3 hot = mix(vColor, vec3(1.0), 0.3) * 1.25;
        vec3 col = mix(deep, mid, smoothstep(0.1, 0.6, v));
        col = mix(col, hot, smoothstep(0.65, 1.0, v));
        col += mix(vColor, vec3(1.0), 0.5) * sparkle;
        // bright rim where the surface is still forming
        col += vColor * 2.0 * (1.0 - smoothstep(0.0, 0.35, reveal)) * (1.0 - vLevel * 0.6);
        float intensity = 1.35 * (0.88 + 0.12 * sin(uTime * 1.7 + vSeed * 9.0));
        gl_FragColor = vec4(col * intensity * vFog, 1.0);
      }`,
    toneMapped: false,
  })
}

const MOTES = 48
function moteGeometry() {
  const g = new BufferGeometry()
  const n = P * MOTES
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  const seed = new Float32Array(n)
  const idx = new Float32Array(n)
  const c = new Color()
  hall.portals.forEach((p, i) => {
    c.set(PORTAL_COLORS[p.color])
    for (let k = 0; k < MOTES; k++) {
      const j = i * MOTES + k
      // spawn anywhere on the surface (local: along z and y)
      pos[j * 3] = p.center[0]
      pos[j * 3 + 1] = p.center[1] + (Math.random() - 0.5) * p.height * 0.95
      pos[j * 3 + 2] = p.center[2] + (Math.random() - 0.5) * p.width * 0.95
      nor.set(p.normal, j * 3)
      c.toArray(col, j * 3)
      seed[j] = Math.random()
      idx[j] = i
    }
  })
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aNormal', new BufferAttribute(nor, 3))
  g.setAttribute('aColor', new BufferAttribute(col, 3))
  g.setAttribute('aSeed', new BufferAttribute(seed, 1))
  g.setAttribute('aIdx', new BufferAttribute(idx, 1))
  return g
}

function moteMaterial() {
  return new ShaderMaterial({
    uniforms: { uTime: time, uLevel: portalLevel, uScale: pointScale, uFog: { value: FOG_DENSITY } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uLevel[${P}]; uniform float uScale; uniform float uFog;
      attribute vec3 aNormal; attribute vec3 aColor; attribute float aSeed; attribute float aIdx;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float level = uLevel[int(aIdx)];
        float life = fract(uTime * (0.12 + aSeed * 0.12) + aSeed * 31.0);
        vec3 p = position + aNormal * (0.05 + life * (1.6 + aSeed * 1.4));
        p.y += sin(uTime * 0.8 + aSeed * 30.0) * 0.25 * life + life * 0.6 * (aSeed - 0.4);
        vec3 side = cross(aNormal, vec3(0.0, 1.0, 0.0));
        p += side * sin(uTime * 0.6 + aSeed * 50.0) * 0.3 * life;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, (0.05 + 0.04 * fract(aSeed * 9.7)) * uScale / -mv.z);
        float f = uFog * -mv.z;
        vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - life) * level * exp(-f * f);
        vColor = mix(aColor, vec3(1.0), 0.35);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        if (vAlpha < 0.01) discard;
        gl_FragColor = vec4(vColor * 1.8 * vAlpha, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

export function Portals() {
  const ref = useRef<InstancedMesh>(null)
  const { geo, mat, levelAttr, motes, moteMat } = useMemo(() => {
    const geo = new PlaneGeometry(1, 1)
    const color = new Float32Array(P * 3)
    const seed = new Float32Array(P)
    const c = new Color()
    hall.portals.forEach((p, i) => {
      c.set(PORTAL_COLORS[p.color]).toArray(color, i * 3)
      seed[i] = (i * 0.37) % 1
    })
    const levelAttr = new InstancedBufferAttribute(new Float32Array(P), 1)
    geo.setAttribute('aColor', new InstancedBufferAttribute(color, 3))
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1))
    geo.setAttribute('aLevel', levelAttr)
    return { geo, mat: surfaceMaterial(), levelAttr, motes: moteGeometry(), moteMat: moteMaterial() }
  }, [])

  const placed = useRef(false)
  useFrame(({ gl, camera }, dt) => {
    time.value += dt
    const m = ref.current
    if (m && !placed.current) {
      placed.current = true
      const q = new Quaternion()
      hall.portals.forEach((p, i) => {
        // plane faces +Z; turn it to face the hall
        q.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...p.normal))
        m.setMatrixAt(i, new Matrix4().compose(new Vector3(...p.center), q, new Vector3(p.width, p.height, 1)))
      })
      m.instanceMatrix.needsUpdate = true
    }
    for (let i = 0; i < P; i++) {
      const s = lightField.sources[sourceOf[i]]
      levelAttr.array[i] = s.level
    }
    levelAttr.needsUpdate = true
    pointScale.value = gl.domElement.height / (2 * Math.tan((((camera as PerspectiveCamera).fov ?? 60) * Math.PI) / 360))
  })

  return (
    <group name="portals">
      <instancedMesh ref={ref} args={[geo, mat, P]} frustumCulled={false} />
      <points geometry={motes} material={moteMat} frustumCulled={false} renderOrder={5} />
    </group>
  )
}
