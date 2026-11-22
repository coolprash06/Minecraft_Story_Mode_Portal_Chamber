/**
 * Item frames holding the portal flints (one per FLINTS entry, beside its portal):
 *  • the oak frame and its flint, tilted a little, with a soft halo and faint sparkles in the
 *    flint's colour while it waits;
 *  • a glowing outline while hovered;
 *  • on pickup, the flint lifts off the frame and flies at the camera, landing in its hotbar slot
 *    (GSAP drives the progress; the path is recomputed every frame, so it tracks the moving camera).
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import gsap from 'gsap'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import { FLINTS, type FlintDef } from '../config/items'
import { FOG_DENSITY } from '../config/theme'
import { flintVoxels } from '../gfx/flintArt'
import { slotMaterials } from '../gfx/materials'
import { outlineGeometry, outlineMaterial, pointScaleFor, wallMatrix } from '../gfx/outline'
import { partsToGeometry } from '../gfx/voxel'
import { onGame } from '../state/events'
import { landPickup } from '../state/game'
import { appStore } from '../state/store'
import { hall } from '../world/layout'
import { damp } from '../lib/random'
import { ITEM_FRAME_PX, ITEM_FRAME_SCALE, itemFrame } from './models'

/** Flint pixel size (m) in the frame: 15 drawn px ≈ 0.62 m inside the 0.71 m backing. */
export const FLINT_SCALE = 0.041
/** Drawn width of the flint sprite (m) at scale 1. */
const FLINT_SPAN = 15 * FLINT_SCALE
/** Tilt in the frame (rad, about the frame normal). */
const FRAME_TILT = -0.2

const flintGeos = new Map<string, BufferGeometry>()
/** Shared flint geometry per flint id (frames, the flight and the held item use the same one). */
export function flintGeometry(def: FlintDef) {
  let g = flintGeos.get(def.id)
  if (!g) {
    g = partsToGeometry(flintVoxels(def.color).mesh(FLINT_SCALE))
    flintGeos.set(def.id, g)
  }
  return g
}

const time = { value: 0 }
const pointScale = { value: 800 }

function haloMaterial(color: string) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uAlpha: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
      void main() {
        // stepped radial falloff: a soft glow that still reads as pixels
        vec2 c = (floor(vUv * 20.0) + 0.5) / 20.0 - 0.5;
        float d = length(c) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.2) * uAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

const SPARKLES = 18
function sparkleGeometry() {
  const g = new BufferGeometry()
  const pos = new Float32Array(SPARKLES * 3)
  const seed = new Float32Array(SPARKLES)
  for (let i = 0; i < SPARKLES; i++) {
    pos.set([(Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, 0.13 + Math.random() * 0.12], i * 3)
    seed[i] = Math.random()
  }
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new BufferAttribute(seed, 1))
  return g
}

function sparkleMaterial(color: string) {
  return new ShaderMaterial({
    uniforms: { uTime: time, uScale: pointScale, uColor: { value: new Color(color).lerp(new Color('#ffffff'), 0.35) }, uAlpha: { value: 0 }, uFog: { value: FOG_DENSITY } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uScale; uniform float uFog;
      attribute float aSeed; varying float vA;
      void main() {
        float life = fract(uTime * (0.22 + aSeed * 0.18) + aSeed * 17.0);
        vec3 p = position + vec3(sin(uTime * 0.9 + aSeed * 40.0) * 0.03, life * 0.22, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // twinkle: a quick flash in the middle of each life
        float tw = smoothstep(0.0, 0.25, life) * (1.0 - smoothstep(0.45, 1.0, life));
        gl_PointSize = max(1.0, (0.022 + 0.018 * fract(aSeed * 13.7)) * uScale / -mv.z);
        float f = uFog * -mv.z;
        vA = tw * exp(-f * f);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main() {
        float a = vA * uAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * 2.4 * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

export function ItemFrames() {
  const frameGeo = useMemo(() => partsToGeometry(itemFrame().mesh(ITEM_FRAME_SCALE)), [])
  const materials = useMemo(slotMaterials, [])
  useEffect(() => () => frameGeo.dispose(), [frameGeo])
  useFrame(({ gl, camera }, dt) => {
    time.value += dt
    pointScale.value = pointScaleFor(gl.domElement.height, camera as PerspectiveCamera)
  })
  return (
    <group name="item-frames">
      {FLINTS.map((f) => (
        <FramedFlint key={f.id} def={f} frameGeo={frameGeo} materials={materials} />
      ))}
    </group>
  )
}

const _v = new Vector3()
const _q = new Quaternion()
const _q2 = new Quaternion()
const _spin = new Quaternion()
const _z = new Vector3(0, 0, 1)
const _s = new Vector3()
const _c = new Vector3()
const _e = new Vector3()

function FramedFlint({ def, frameGeo, materials }: { def: FlintDef; frameGeo: BufferGeometry; materials: ReturnType<typeof slotMaterials> }) {
  const placement = hall.portals[def.portalId].holders[def.holder]
  const item = useRef<Mesh>(null)
  const parts = useMemo(() => {
    const frameM = wallMatrix(placement)
    const size = ITEM_FRAME_PX.size * ITEM_FRAME_SCALE
    const outline = outlineGeometry(size + 0.1, size + 0.1, 0.035)
    // flint rest pose: on the backing (1 px), tilted in the frame plane
    const restLocal = new Matrix4().compose(new Vector3(0, 0, ITEM_FRAME_SCALE + 0.002), new Quaternion().setFromAxisAngle(_z, FRAME_TILT), new Vector3(1, 1, 1))
    const rest = frameM.clone().multiply(restLocal)
    const restPos = new Vector3()
    const restQ = new Quaternion()
    rest.decompose(restPos, restQ, new Vector3())
    return {
      frameM,
      outline,
      outlineMat: outlineMaterial(def.color),
      halo: new PlaneGeometry(0.8, 0.8),
      haloMat: haloMaterial(def.color),
      sparkles: sparkleGeometry(),
      sparkleMat: sparkleMaterial(def.color),
      restPos,
      restQ,
      normal: new Vector3(...placement.normal),
    }
  }, [def, placement])
  useEffect(
    () => () => {
      for (const d of [parts.outline, parts.outlineMat, parts.halo, parts.haloMat, parts.sparkles, parts.sparkleMat]) d.dispose()
    },
    [parts],
  )

  // fx state: `present` = the flint's glow (fades out on pickup); `hover` = damped highlight
  const st = useRef({ present: appStore.get().taken.includes(def.id) ? 0 : 1, hover: 0, flight: null as null | { t: number; slot: number } })

  useEffect(
    () =>
      onGame('pickup', ({ flintId, slot }) => {
        if (flintId !== def.id) return
        const s = st.current
        const flight = { t: 0, slot }
        s.flight = flight
        gsap.to(s, { present: 0, duration: 0.35, ease: 'power1.out' })
        gsap.to(flight, {
          t: 1,
          duration: 0.95,
          ease: 'power2.inOut',
          onComplete: () => {
            s.flight = null
            landPickup(def.id, slot)
          },
        })
      }),
    [def.id],
  )

  useFrame(({ camera }, dt) => {
    const s = st.current
    const state = appStore.get()
    const hovered = state.hover?.kind === 'frame' && state.hover.flintId === def.id
    s.hover = damp(s.hover, hovered ? 1 : 0, 12, dt)
    const pulse = 0.85 + 0.15 * Math.sin(time.value * 2.2)
    parts.outlineMat.opacity = s.hover * (0.75 + 0.25 * Math.sin(time.value * 6))
    parts.haloMat.uniforms.uAlpha.value = s.present * (0.26 * pulse + 0.4 * s.hover)
    parts.sparkleMat.uniforms.uAlpha.value = s.present * (1 + 0.6 * s.hover)

    const m = item.current
    if (!m) return
    const taken = state.taken.includes(def.id)
    if (!s.flight) {
      m.visible = !taken
      if (!taken) {
        m.position.copy(parts.restPos)
        m.quaternion.copy(parts.restQ)
        m.scale.setScalar(1)
      }
      return
    }

    // ── flight: lift off the frame, swing out over the aisle, land in the hotbar slot ──
    m.visible = true
    const t = s.flight.t
    const cam = camera as PerspectiveCamera
    // end: the slot's screen position, 0.7 m in front of the camera
    const el = document.querySelector<HTMLElement>(`[data-hotbar-slot="${s.flight.slot}"]`)
    const r = el?.getBoundingClientRect()
    const sx = r ? ((r.left + r.width / 2) / window.innerWidth) * 2 - 1 : 0
    const sy = r ? -((r.top + r.height / 2) / window.innerHeight) * 2 + 1 : -0.85
    const D = 0.7
    _e.set(sx, sy, 0.5).unproject(cam).sub(cam.position).normalize()
    const along = D / Math.max(0.2, _e.dot(_v.set(0, 0, -1).applyQuaternion(cam.quaternion)))
    _e.multiplyScalar(along).add(cam.position)
    // control point: out of the frame towards the aisle and up
    _s.copy(parts.restPos)
    _c.copy(parts.restPos).addScaledVector(parts.normal, 1.6).add(_v.set(0, 0.7, 0))
    const u = 1 - t
    m.position.set(0, 0, 0).addScaledVector(_s, u * u).addScaledVector(_c, 2 * u * t).addScaledVector(_e, t * t)
    // turn to face the camera, with one full spin on the way
    const k = t * t * (3 - 2 * t)
    _q.copy(parts.restQ).slerp(cam.quaternion, k)
    _spin.setFromAxisAngle(_v.set(0, 1, 0), Math.PI * 2 * k)
    _q2.copy(_q).multiply(_spin)
    m.quaternion.copy(_q2)
    // shrink to the icon's size on screen (≈ 70 % of the slot)
    const pxPerM = window.innerHeight / (2 * D * Math.tan((cam.fov * Math.PI) / 360))
    const endScale = ((r?.height ?? 48) * 0.72) / (FLINT_SPAN * pxPerM)
    // a quick "pop" off the frame first, then ease down to the icon size
    const pop = 1 + 0.25 * Math.sin(Math.min(1, t * 3) * Math.PI)
    m.scale.setScalar((1 + (endScale - 1) * Math.pow(t, 1.4)) * pop)
  })

  return (
    <group>
      <group matrixAutoUpdate={false} matrix={parts.frameM}>
        <mesh geometry={frameGeo} material={materials} receiveShadow />
        {/* halo sits on the backing, behind the flint */}
        <mesh geometry={parts.halo} material={parts.haloMat} position={[0, 0, ITEM_FRAME_SCALE + 0.001]} renderOrder={4} />
        <points geometry={parts.sparkles} material={parts.sparkleMat} frustumCulled={false} renderOrder={6} />
        <mesh geometry={parts.outline} material={parts.outlineMat} position={[0, 0, 0.012]} renderOrder={6} />
      </group>
      <mesh ref={item} geometry={flintGeometry(def)} material={materials} frustumCulled={false} dispose={null} />
    </group>
  )
}
