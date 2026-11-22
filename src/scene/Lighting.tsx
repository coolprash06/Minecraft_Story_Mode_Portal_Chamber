/**
 * Lighting driver: the shadow pool + the per-frame light-field update, plus the ambient
 * environment (a dim, cool PMREM room so metal and polished stone have something to reflect).
 *
 * SHADOW POOL: a fixed set of real shadow-casting point lights (2 on High, 1 on Low; fixed for
 * the session, so no shader ever recompiles). Every ~0.25 s it picks the lit sources that matter most
 * to the current view (bright, near, in front). A chosen source is crossfaded out of the light
 * field and into a pool light (field share 1 − w, pool share w), so ownership changes never pop:
 * both paths use identical attenuation and BRDF. Shadow maps are only re-rendered when a pool light
 * takes a new source or its source has swayed, and at most one per frame.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, BoxGeometry, FrontSide, Color, Mesh, MeshBasicMaterial, PMREMGenerator, PointLight, Scene, Vector3 } from 'three'
import { lightField, type LightSource } from '../gfx/lightField'
import { useApp } from '../state/store'

/**
 * Measured on an Intel Arc 140T at ~2400×1340 (GPU time, ?bench): each PCF point shadow costs
 * ~1.6 ms per frame there (5 filtered cube taps per pixel), so High keeps 2 (p90 ≈ 11 ms total).
 */
const POOL = { high: { count: 2, map: 512 }, low: { count: 1, map: 256 } } as const
/** ?off=shadows (debug knob: measure what the shadow pool costs). */
const NO_SHADOWS = new URLSearchParams(window.location.search).get('off')?.split(',').includes('shadows') ?? false
/** ?pool=N (debug knob: override the pool size). */
const POOL_OVERRIDE = Number(new URLSearchParams(window.location.search).get('pool')) || 0
const FADE = 3.5 // 1/s
const RESELECT = 0.25 // s
/** A swaying source only gets a fresh shadow map once it has moved this far (m)... */
const RESHADOW_DIST = 0.12
/** ...and shadow maps are re-rendered at most this often (s), one light at a time. */
const RESHADOW_INTERVAL = 0.1

interface PoolSlot {
  light: PointLight
  source: LightSource | null
  next: LightSource | null
  w: number
  shadowAt: Vector3
  dirty: boolean
}

export function Lighting() {
  const quality = useApp((s) => s.quality)
  const conf = POOL[quality]
  const slots = useMemo<PoolSlot[]>(
    () =>
      Array.from({ length: NO_SHADOWS ? 0 : POOL_OVERRIDE || conf.count }, () => {
        const light = new PointLight('#ffffff', 0, 10, 2)
        light.castShadow = true
        light.shadow.mapSize.set(conf.map, conf.map)
        light.shadow.autoUpdate = false
        light.shadow.needsUpdate = true
        light.shadow.bias = -0.003
        light.shadow.normalBias = 0.04
        light.shadow.radius = 2
        light.shadow.camera.near = 0.15
        light.position.set(0, -50, 0)
        return { light, source: null, next: null, w: 0, shadowAt: new Vector3(), dirty: true }
      }),
    [conf],
  )
  useEffect(() => () => slots.forEach((s) => s.light.dispose()), [slots])

  const timer = useRef(0)
  const sinceShadow = useRef(0)
  const camDir = useMemo(() => new Vector3(), [])
  const to = useMemo(() => new Vector3(), [])

  useFrame(({ camera, clock }, dt) => {
    // 1. choose (with hysteresis: a held source only loses its slot to a clearly better one)
    timer.current -= dt
    if (timer.current <= 0) {
      timer.current = RESELECT
      camera.getWorldDirection(camDir)
      const scored: { s: LightSource; score: number }[] = []
      for (const s of lightField.sources) {
        // Soul chandeliers stay field-only: soft overhead light needs no shadows, and their gold
        // takes a reduced field share (materials.ts) that a real pool light wouldn't respect.
        if (s.kind === 'chandelier') continue
        const e = lightField.strength(s)
        if (e < 0.05 * s.intensity) continue
        to.copy(s.pos).sub(camera.position)
        const d2 = to.lengthSq()
        if (d2 > 30 * 30) continue
        const facing = to.normalize().dot(camDir) > -0.2 ? 1 : 0.3
        const held = slots.some((p) => p.source === s) ? 1.4 : 1
        scored.push({ s, score: (e / Math.max(d2, 4)) * facing * held })
      }
      scored.sort((a, b) => b.score - a.score)
      const want = new Set(scored.slice(0, slots.length).map((x) => x.s))
      const free = [...want].filter((s) => !slots.some((p) => p.source === s || p.next === s))
      for (const p of slots) {
        if (p.source && !want.has(p.source) && !p.next) p.next = free.shift() ?? null
        if (!p.source && !p.next) p.next = free.shift() ?? null
      }
    }

    // 2. crossfade and drive the pool lights
    sinceShadow.current += dt
    let updated = sinceShadow.current < RESHADOW_INTERVAL
    for (const p of slots) {
      const leaving = p.next !== null || (p.source !== null && lightField.strength(p.source) <= 0)
      if (p.source && leaving) p.w = Math.max(0, p.w - FADE * dt)
      else if (p.source) p.w = Math.min(1, p.w + FADE * dt)
      if (p.source) p.source.shadowWeight = p.w
      if ((!p.source || p.w === 0) && p.next) {
        if (p.source) p.source.shadowWeight = 0
        p.source = p.next
        p.next = null
        p.w = 0
        p.dirty = true
      } else if (p.source && p.w === 0 && leaving) {
        p.source.shadowWeight = 0
        p.source = null
      }
      const s = p.source
      if (!s) {
        p.light.intensity = 0
        continue
      }
      p.light.color.copy(s.color)
      p.light.distance = s.range
      p.light.shadow.camera.far = s.range
      p.light.intensity = lightField.strength(s) * p.w
      if (p.shadowAt.distanceToSquared(s.pos) > RESHADOW_DIST * RESHADOW_DIST) p.dirty = true
      // at most one shadow re-render per interval
      if (p.dirty && !updated) {
        updated = true
        sinceShadow.current = 0
        p.dirty = false
        p.shadowAt.copy(s.pos)
        p.light.shadow.camera.updateProjectionMatrix()
        p.light.shadow.needsUpdate = true
      }
      // The pool light stays where its shadow map was rendered, so light and shadow always agree
      // (a swaying lantern drifts by centimetres; its field share still follows the sway).
      p.light.position.copy(p.shadowAt)
    }

    // 3. upload the field (after the pool has taken its shares)
    lightField.update(clock.elapsedTime, dt)
  }, -1)

  return (
    <>
      {slots.map((p, i) => (
        <primitive key={i} object={p.light} />
      ))}
      <AmbientEnvironment />
    </>
  )
}

/** A dim blue-black room with a few warm and coloured glows, prefiltered for IBL. */
function AmbientEnvironment() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const room = new Scene()
    const box = new BoxGeometry(1, 1, 1)
    const add = (color: string, scale: number, pos: [number, number, number], size: [number, number, number], back = false) => {
      const m = new Mesh(box, new MeshBasicMaterial({ color: new Color(color).multiplyScalar(scale), side: back ? BackSide : FrontSide }))
      m.position.set(...pos)
      m.scale.set(...size)
      room.add(m)
    }
    add('#141a30', 1, [0, 0, 0], [20, 12, 40], true)
    add('#ff9a48', 3.5, [-9, 2, -6], [0.5, 1.2, 1.2])
    add('#ff9a48', 3.5, [9, 2, 6], [0.5, 1.2, 1.2])
    add('#ffc982', 3, [0, 5.5, 0], [6, 0.4, 14])
    add('#3a5bff', 1.6, [-9.5, -2, 8], [0.3, 3, 2])
    add('#ff2b2b', 1.4, [9.5, -2, -8], [0.3, 3, 2])
    add('#2bff5c', 1.2, [9.5, -2, 12], [0.3, 3, 2])
    add('#06070b', 1, [0, -5.9, 0], [20, 0.2, 40])
    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromScene(room, 0.04).texture
    // Per material, not scene.environment (which would force one strength on everything):
    // metal and gems reflect it strongly, stone and cloth only take a faint cool fill.
    for (const m of lightField.materials) {
      m.envMap = env
      m.envMapIntensity = m.userData.envIntensity as number
      m.needsUpdate = true
    }
    pmrem.dispose()
    box.dispose()
    return () => {
      for (const m of lightField.materials) m.envMap = null
      env.dispose()
    }
  }, [gl])
  return null
}
