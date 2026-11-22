/**
 * Glide mode: a cinematic camera on a rail down the centre of the hall.
 *  • Move: scroll / trackpad / touch drag, W S ↑ ↓. A target slides along the rail and the camera
 *    follows with damped easing, a slow sway and a slight bob while moving.
 *  • Movement is relative to the view: W / scroll down / swipe up go the way you are FACING along
 *    the hall, S / scroll up go backwards. The sign comes from the camera's forward vector along
 *    the hall axis, with a hysteresis band around 90° so looking sideways never flips it back and
 *    forth (inside the band the last direction is kept).
 *  • Near the far end, while facing it, the view tilts up a little towards the portrait.
 *  • Look: click-and-drag (left or right button) turns the view a full 360° and ±60° up/down,
 *    damped. A D ← → also turn. When not dragging, the gaze leans gently towards the cursor.
 *  • ?z=-30 starts at that z, ?yaw=180 / ?pitch=10 (degrees) set the initial view,
 *    ?bench=N glides the whole rail in N seconds (for FPS measurement).
 *  • cameraFx (portal ignition) adds a short shake and an FOV pulse on top.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { cameraFx } from '../gfx/portalFx'
import { clamp, damp } from '../lib/random'
import { appStore } from '../state/store'
import { hall } from '../world/layout'

const { zStart, zEnd, y: RAIL_Y } = hall.rail
const WHEEL_SCALE = 0.012
const KEY_SPEED = 7
const TURN_SPEED = 1.7
const DRAG_YAW = 0.0055
const DRAG_PITCH = 0.0045
const PITCH_LIMIT = (60 * Math.PI) / 180
const DRAG_THRESHOLD = 4
/** |forward·hall axis| must exceed this (≈ 6° from side-on) before the travel direction can flip. */
const FACING_DEADBAND = Math.sin((6 * Math.PI) / 180)
/** Tilt (rad) towards the portrait at the end of the rail, blended in over the last metres. */
const END_TILT = 0.1
const END_TILT_SPAN = 7

const params = new URLSearchParams(window.location.search)
const num = (k: string, d: number) => {
  const v = params.get(k)
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) ? n : d
}
const startZ = clamp(num('z', zStart), zEnd, zStart)
const startYaw = (num('yaw', 0) * Math.PI) / 180
const startPitch = clamp((num('pitch', 0) * Math.PI) / 180, -PITCH_LIMIT, PITCH_LIMIT)
const benchSeconds = num('bench', 0)

/** True while a drag-look is in progress (so a click handler can ignore the release). */
export const lookState = { dragging: false, moved: 0 }

export function GlideRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const s = useRef({
    target: startZ,
    z: startZ,
    travelled: 0,
    t: 0,
    mouse: { x: 0, y: 0 },
    lean: { x: 0, y: 0, w: 1 },
    yawT: startYaw,
    pitchT: startPitch,
    yaw: startYaw,
    pitch: startPitch,
    keys: { fwd: false, back: false, left: false, right: false },
    down: null as null | { x: number; y: number },
    /** z-sign of "forward" along the hall: −1 = facing the far end, +1 = facing the entrance. */
    fs: -Math.cos(startYaw) > 0 ? 1 : -1,
    lastTouchY: null as number | null,
    benchT: -1,
    baseFov: null as number | null,
  })

  useEffect(() => {
    const st = s.current
    const el = gl.domElement
    const active = () => appStore.get().mode === 'glide'
    const move = (dz: number) => (st.target = clamp(st.target + dz, zEnd, zStart))

    const onWheel = (e: WheelEvent) => {
      if (!active()) return
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
      // scroll down (deltaY > 0) moves forward, i.e. along the facing direction
      move(st.fs * e.deltaY * unit * WHEEL_SCALE)
    }
    const onDown = (e: PointerEvent) => {
      if (!active() || e.pointerType === 'touch' || (e.button !== 0 && e.button !== 2)) return
      st.down = { x: e.clientX, y: e.clientY }
      lookState.moved = 0
    }
    const onMove = (e: PointerEvent) => {
      st.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
      st.mouse.y = (e.clientY / window.innerHeight) * 2 - 1
      if (!st.down || !active()) return
      lookState.moved += Math.abs(e.movementX) + Math.abs(e.movementY)
      if (!lookState.dragging && lookState.moved > DRAG_THRESHOLD) {
        lookState.dragging = true
        document.body.style.cursor = 'grabbing'
      }
      if (lookState.dragging) {
        st.yawT -= e.movementX * DRAG_YAW
        st.pitchT = clamp(st.pitchT - e.movementY * DRAG_PITCH, -PITCH_LIMIT, PITCH_LIMIT)
      }
    }
    const onUp = () => {
      st.down = null
      if (lookState.dragging) document.body.style.cursor = ''
      // keep `dragging` true through this event so a click handler can ignore it
      setTimeout(() => (lookState.dragging = false), 0)
    }
    const onContext = (e: Event) => e.preventDefault()
    const onTouchStart = (e: TouchEvent) => (st.lastTouchY = e.touches[0]?.clientY ?? null)
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      if (y === undefined || st.lastTouchY === null) return
      // swipe up moves forward
      move(st.fs * (st.lastTouchY - y) * WHEEL_SCALE * 2.5)
      st.lastTouchY = y
    }
    const key = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'w' || k === 'arrowup') st.keys.fwd = down
      if (k === 's' || k === 'arrowdown') st.keys.back = down
      if (k === 'a' || k === 'arrowleft') st.keys.left = down
      if (k === 'd' || k === 'arrowright') st.keys.right = down
    }
    const onKeyDown = key(true)
    const onKeyUp = key(false)
    const onBlur = () => Object.assign(st.keys, { fwd: false, back: false, left: false, right: false })

    window.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('contextmenu', onContext)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('contextmenu', onContext)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [gl])

  useFrame((_, dt) => {
    const st = s.current
    if (appStore.get().mode !== 'glide') return
    st.t += dt

    if (benchSeconds > 0 && appStore.get().sceneReady) {
      if (st.benchT < 0) st.benchT = 0
      st.benchT += dt
      st.target = zStart - (zStart - zEnd) * Math.min(1, st.benchT / benchSeconds)
    }
    // forward along the hall from the view yaw (pitch never flips its sign: |pitch| < 90°)
    const fwdZ = -Math.cos(st.yaw)
    if (Math.abs(fwdZ) > FACING_DEADBAND) st.fs = fwdZ > 0 ? 1 : -1
    const keyDir = (st.keys.fwd ? 1 : 0) - (st.keys.back ? 1 : 0)
    if (keyDir) st.target = clamp(st.target + st.fs * keyDir * KEY_SPEED * dt, zEnd, zStart)
    if (st.keys.left) st.yawT += TURN_SPEED * dt
    if (st.keys.right) st.yawT -= TURN_SPEED * dt

    const prev = st.z
    st.z = damp(st.z, st.target, 2.4, dt)
    const speed = dt > 0 ? Math.abs(st.z - prev) / dt : 0
    st.travelled += Math.abs(st.z - prev)
    const moving = Math.min(speed / 4, 1)

    const t = st.t
    const x = Math.sin(t * 0.37) * 0.07 + Math.sin(t * 0.13 + 1.3) * 0.05
    const y = RAIL_Y + Math.sin(t * 0.52) * 0.035 + Math.sin(st.travelled * 1.9) * 0.03 * moving
    camera.position.set(x, y, st.z)

    // Drag look (damped), plus the cursor lean, which fades out while dragging.
    st.yaw = damp(st.yaw, st.yawT, 9, dt)
    st.pitch = damp(st.pitch, st.pitchT, 9, dt)
    st.lean.w = damp(st.lean.w, lookState.dragging || st.down ? 0 : 1, 4, dt)
    st.lean.x = damp(st.lean.x, st.mouse.x, 2.2, dt)
    st.lean.y = damp(st.lean.y, st.mouse.y, 2.2, dt)
    const yaw = st.yaw - st.lean.x * 0.2 * st.lean.w + Math.sin(t * 0.21) * 0.01
    // near the far wall, look up a touch at the portrait (only while facing it)
    const endBlend = clamp((zEnd + END_TILT_SPAN - st.z) / END_TILT_SPAN, 0, 1)
    const endTilt = END_TILT * endBlend * endBlend * (3 - 2 * endBlend) * Math.max(0, Math.cos(st.yaw))
    const pitch = clamp(st.pitch - st.lean.y * 0.1 * st.lean.w + 0.02 + endTilt + Math.sin(t * 0.29) * 0.005, -PITCH_LIMIT - 0.1, PITCH_LIMIT + 0.1)
    const roll = Math.sin(t * 0.31) * 0.004 - st.lean.x * 0.01 * st.lean.w
    // effects: a decaying shake (layered sines, so it's smooth, not jittery) and an FOV pulse
    const sh = cameraFx.shake
    if (sh > 0.001) {
      camera.position.x += (Math.sin(t * 41.3) * 0.6 + Math.sin(t * 73.1 + 1.7) * 0.4) * 0.028 * sh
      camera.position.y += (Math.sin(t * 47.9 + 0.6) * 0.6 + Math.sin(t * 89.3) * 0.4) * 0.028 * sh
    }
    camera.rotation.set(pitch + Math.sin(t * 53.7) * 0.005 * sh, yaw + Math.sin(t * 38.9 + 2.1) * 0.005 * sh, roll + Math.sin(t * 29.3) * 0.006 * sh, 'YXZ')
    const cam = camera as PerspectiveCamera
    st.baseFov ??= cam.fov
    const fov = st.baseFov + cameraFx.fov
    if (Math.abs(cam.fov - fov) > 1e-4) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }

    const progress = (zStart - st.z) / (zStart - zEnd)
    if (Math.abs(progress - appStore.get().glide) > 0.002) appStore.set({ glide: progress })
  })

  return null
}
