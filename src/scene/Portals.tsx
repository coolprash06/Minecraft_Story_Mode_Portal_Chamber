/**
 * Portal surfaces and their particles. All 18 share one instanced draw:
 *  • the surface is an animated swirl of layered noise in the portal's colour, quantised to the
 *    block grid (16 px per block) and to a few tones, so it reads as moving pixel art;
 *  • `fill` (0..1, portalFx) reveals the surface from the bottom of the opening up, behind a
 *    bright ragged front; lighting a portal tweens it over ~1.5 s, a portal lit at load starts full.
 *    `level` (the light field's fade) eases the brightness in alongside;
 *  • soft square motes drift out of each lit portal into the hall and fade;
 *  • entry "spiral mode" (portalFx.spiral, tweened by EntryRig): rings and log-spiral arms grow out
 *    from the centre over the swirl, which speeds up, and the motes stream back into the opening.
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
import { portalFx } from '../gfx/portalFx'
import { surfaceMaterial } from '../gfx/portalSurface'
import { OFF } from '../lib/debug'
import { hall } from '../world/layout'

const P = hall.portals.length
/** Per-portal on-level, written by the light field each frame (shared with the frame glow). */
const portalLevel = lightField.portalLevels
const time = { value: 0 }
const pointScale = { value: 800 }
/** Light-field source index of each portal. */
const sourceOf = hall.portals.map((p) => lightField.sources.find((s) => s.kind === 'portal' && s.owner === p.id)!.index)

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
    uniforms: { uTime: time, uLevel: portalLevel, uScale: pointScale, uFog: { value: FOG_DENSITY }, uSpiral: { value: portalFx.spiral }, uMoteTime: { value: portalFx.moteTime } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uLevel[${P}]; uniform float uScale; uniform float uFog;
      uniform float uSpiral[${P}]; uniform float uMoteTime[${P}];
      attribute vec3 aNormal; attribute vec3 aColor; attribute float aSeed; attribute float aIdx;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        int idx = int(aIdx);
        float level = uLevel[idx];
        float spiral = uSpiral[idx];
        // uMoteTime runs faster during spiral mode; the motes then flow back into the opening
        float life = fract(uMoteTime[idx] * (0.12 + aSeed * 0.12) + aSeed * 31.0);
        float out_ = mix(life, 1.0 - life, spiral);
        vec3 p = position + aNormal * (0.05 + out_ * (1.6 + aSeed * 1.4));
        p.y += sin(uTime * 0.8 + aSeed * 30.0) * 0.25 * life + life * 0.6 * (aSeed - 0.4);
        vec3 side = cross(aNormal, vec3(0.0, 1.0, 0.0));
        p += side * sin(uTime * 0.6 + aSeed * 50.0) * 0.3 * life;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, (0.05 + 0.04 * fract(aSeed * 9.7)) * uScale / -mv.z);
        float f = uFog * -mv.z;
        vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - life) * level * exp(-f * f);
        vColor = mix(aColor, vec3(1.0), 0.35) * (1.0 + spiral);
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
  const { geo, mat, levelAttr, fillAttr, spiralAttr, motes, moteMat } = useMemo(() => {
    const geo = new PlaneGeometry(1, 1)
    const color = new Float32Array(P * 3)
    const seed = new Float32Array(P)
    const c = new Color()
    hall.portals.forEach((p, i) => {
      c.set(PORTAL_COLORS[p.color]).toArray(color, i * 3)
      seed[i] = (i * 0.37) % 1
    })
    const levelAttr = new InstancedBufferAttribute(new Float32Array(P), 1)
    const fillAttr = new InstancedBufferAttribute(new Float32Array(P), 1)
    const spiralAttr = new InstancedBufferAttribute(new Float32Array(P * 3), 3)
    geo.setAttribute('aColor', new InstancedBufferAttribute(color, 3))
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 1))
    geo.setAttribute('aLevel', levelAttr)
    geo.setAttribute('aFill', fillAttr)
    geo.setAttribute('aSpiral', spiralAttr)
    return { geo, mat: surfaceMaterial({ time, fog: FOG_DENSITY }), levelAttr, fillAttr, spiralAttr, motes: moteGeometry(), moteMat: moteMaterial() }
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
      fillAttr.array[i] = portalFx.fill[i]
      const sp = portalFx.spiral[i]
      portalFx.spiralTime[i] += dt * sp * 1.5
      portalFx.moteTime[i] += dt * (1 + sp * 2.5)
      spiralAttr.array[i * 3] = sp
      spiralAttr.array[i * 3 + 1] = portalFx.spiralTime[i]
      spiralAttr.array[i * 3 + 2] = portalFx.fade[i]
    }
    levelAttr.needsUpdate = true
    fillAttr.needsUpdate = true
    spiralAttr.needsUpdate = true
    pointScale.value = gl.domElement.height / (2 * Math.tan((((camera as PerspectiveCamera).fov ?? 60) * Math.PI) / 360))
  })

  return (
    <group name="portals">
      <instancedMesh ref={ref} args={[geo, mat, P]} frustumCulled={false} visible={!OFF.has('surfaces')} />
      <points geometry={motes} material={moteMat} frustumCulled={false} renderOrder={5} visible={!OFF.has('motes')} />
    </group>
  )
}
