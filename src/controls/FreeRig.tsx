/**
 * Free Roam in the hall: the reusable player controller (src/player) wired to the hall's colliders,
 * the store, the camera and the hall's interactions.
 *
 *  • F (or the mode badge) toggles Glide ⇄ Free Roam (game.setMode). Entering starts from the
 *    current camera pose: feet dropped onto the floor below it, same yaw / pitch, and the view
 *    blends from the rail pose (eye height 2.1 → 1.7 m) over ~0.45 s. Leaving hands the camera to
 *    GlideRig at the nearest rail point (its own hand-back blend).
 *  • Pointer lock: taken on entering (inside the gesture), released by us on leaving / entering a
 *    portal. When the browser releases it (Esc), store.freeLock = 'released' and the pause menu shows.
 *    A portal with a 3D world keeps the lock through the warp: the world (Mission 1's ship) reads
 *    this same `freeInput`, so you arrive already playing, and come home still locked.
 *  • Left-click or E interacts with what the crosshair targets (Interaction does the picking);
 *    lit portals only open by jumping into them (the hall world's triggers call enterPortal 'free').
 *  • Footsteps / jump / landing go to the sfx hooks with the surface underfoot.
 *  • Coming back from a dimension entered in Free Roam: EntryRig puts the camera on the portal's
 *    mat facing the hall, then `freeControl.place` hands it back here.
 *  • Debug: ?mode=free starts here; ?x ?z ?yaw ?pitch set the start (?y too with ?noclip, which
 *    flies with no collision). ?nolock simulates the pointer lock (automated tests: headless
 *    browsers refuse it); Esc then pauses as usual.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Quaternion, Vector3, type PerspectiveCamera } from 'three'
import { playSfx } from '../audio/sfx'
import { worldFor } from '../config/dimensions'
import { cameraFx, portalFx } from '../gfx/portalFx'
import { REDUCED_MOTION } from '../lib/device'
import { clamp } from '../lib/random'
import { FirstPersonInput } from '../player/input'
import { PLAYER, PlayerController, type ViewPose } from '../player/PlayerController'
import { onGame } from '../state/events'
import { enterPortal, interact, requestFreeLock, toggleMode } from '../state/game'
import { appStore, DEBUG_FREE, isLit } from '../state/store'
import { buildHallWorld } from '../world/hallColliders'
import { hall } from '../world/layout'
import { BASE_FOV, glideControl } from './GlideRig'

/** Blend time (s) from the previous camera pose into Free Roam. */
const BLEND_IN = 0.45
/** Where "Return to Entrance" puts you: on the carpet just inside the entrance, facing down the hall. */
const ENTRANCE = { x: 0, z: 0, yaw: 0 }

const params = new URLSearchParams(window.location.search)
const num = (k: string, d: number) => {
  const v = params.get(k)
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) ? n : d
}
const NOCLIP = params.has('noclip')

/** Shared with the HUD / pause menu (pointer-lock requests come through game events). */
export const freeInput = new FirstPersonInput()

/** EntryRig: hand the camera back after a return from a dimension (feet x / z, facing yaw). */
export const freeControl = {
  place: (_x: number, _z: number, _yaw: number) => {},
}

const _q = new Quaternion()

export function FreeRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const st = useRef({
    player: null as PlayerController | null,
    view: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0 } as ViewPose,
    blend: 1,
    fromPos: new Vector3(),
    fromQuat: new Quaternion(),
    t: 0,
  })

  useEffect(() => {
    const s = st.current
    const world = buildHallWorld({
      isLit: (id) => isLit(appStore.get().litMask, id),
      enterPortal: (id) => {
        // only once the surface has filled (enterPortal checks that too)
        if (portalFx.fill[id] >= 0.98) enterPortal(id, 'free')
      },
    })
    const player = new PlayerController(world, {
      onStep: (surface, at) => playSfx('step', { at, surface }),
      onJump: (at) => playSfx('jump', { at }),
      onLand: (impact, surface, at) => {
        if (impact > 3) playSfx('land', { at, surface, impact })
      },
    })
    player.reducedMotion = REDUCED_MOTION
    player.noclip = NOCLIP
    s.player = player
    // ?debug: a handle for flow tests (read the player / store from the console)
    if (params.has('debug')) Object.assign(window, { __free: { player, store: appStore } })

    const startFrom = (x: number, y: number, z: number, yaw: number, pitch: number, blendFromCamera: boolean) => {
      player.place(x, y, z, yaw, pitch)
      if (blendFromCamera) {
        s.fromPos.copy(camera.position)
        s.fromQuat.copy(camera.quaternion)
        s.blend = REDUCED_MOTION ? 1 : 0
      } else s.blend = 1
    }

    // ?mode=free: start at ?x ?z (default: the entrance), behind the "click to play" menu
    if (DEBUG_FREE) {
      const eyeY = num('y', hall.rail.y)
      startFrom(num('x', ENTRANCE.x), NOCLIP ? eyeY - PLAYER.eye : 1, num('z', ENTRANCE.z), (num('yaw', 0) * Math.PI) / 180, (num('pitch', 0) * Math.PI) / 180, false)
    }

    const el = gl.domElement
    freeInput.attach(el)
    freeInput.simulate = params.has('nolock')
    const lock = () => {
      const a = appStore.get()
      if (a.mode !== 'free' && a.journey !== 'world') return
      if (freeInput.locked) return appStore.set({ freeLock: 'locked' })
      appStore.set({ freeLock: 'pending' })
      void freeInput.lock().then((ok) => {
        if (ok === false && !freeInput.locked && appStore.get().freeLock === 'pending') appStore.set({ freeLock: 'refused' })
      })
    }
    const offChange = freeInput.onChange((locked) => {
      // a stray lock in Glide (in the hall) is dropped; a 3D world locks whatever the hall's mode
      if (locked && appStore.get().mode !== 'free' && appStore.get().journey === 'hall') return freeInput.unlock()
      appStore.set({ freeLock: locked ? 'locked' : 'released' })
    })
    const offError = freeInput.onError(() => {
      if (appStore.get().freeLock === 'pending') appStore.set({ freeLock: 'refused' })
    })

    const offMode = onGame('mode', ({ mode }) => {
      if (mode === 'free') {
        camera.rotation.reorder('YXZ')
        startFrom(camera.position.x, camera.position.y - PLAYER.eye, camera.position.z, camera.rotation.y, camera.rotation.x, true)
        lock()
      } else {
        freeInput.unlock()
        appStore.set({ freeLock: 'released' })
        camera.rotation.reorder('YXZ')
        glideControl.place(camera.position.z, camera.rotation.y)
      }
    })
    const offLock = onGame('requestLock', lock)
    const offEntrance = onGame('toEntrance', () => {
      startFrom(ENTRANCE.x, 1, ENTRANCE.z, ENTRANCE.yaw, 0, false)
    })
    freeControl.place = (x, z, yaw) => {
      camera.rotation.reorder('YXZ')
      startFrom(x, camera.position.y - PLAYER.eye, z, yaw, camera.rotation.x, true)
      if (freeInput.locked) appStore.set({ freeLock: 'locked' })
    }

    // entering a portal releases the mouse (the dimension screen needs a cursor); a 3D world keeps it
    let lastJourney = appStore.get().journey
    const offStore = appStore.subscribe(() => {
      const j = appStore.get().journey
      if (j !== lastJourney && j === 'entering' && !worldFor(appStore.get().journeyPortal)) freeInput.unlock()
      lastJourney = j
    })

    const playing = () => {
      const a = appStore.get()
      return a.mode === 'free' && a.journey === 'hall' && a.sceneReady
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'KeyF') {
        // the pause menu's buttons have focus handling of their own; F works everywhere in the hall
        toggleMode()
        return
      }
      if (e.code === 'KeyE' && playing() && freeInput.locked) interact(appStore.get().hover)
    }
    const onDown = (e: PointerEvent) => {
      if (!playing() || e.button !== 0) return
      if (freeInput.locked) interact(appStore.get().hover)
      else requestFreeLock()
    }
    window.addEventListener('keydown', onKey)
    el.addEventListener('pointerdown', onDown)

    return () => {
      offChange()
      offError()
      offMode()
      offLock()
      offEntrance()
      offStore()
      window.removeEventListener('keydown', onKey)
      el.removeEventListener('pointerdown', onDown)
      freeInput.unlock()
      freeInput.detach()
      freeControl.place = () => {}
    }
  }, [camera, gl])

  useFrame((_, dt) => {
    const s = st.current
    const a = appStore.get()
    const player = s.player
    freeInput.enabled = a.mode === 'free' && a.journey === 'hall' && a.freeLock === 'locked'
    if (!player || a.mode !== 'free' || a.journey !== 'hall') return
    s.t += dt

    // paused (or not started): the world holds still, the view keeps its pose
    if (freeInput.enabled && a.sceneReady) {
      const [lx, ly] = freeInput.takeLook()
      player.look(lx, ly)
      player.update(dt, freeInput.move())
    } else freeInput.takeLook()

    const v = player.viewPose(s.view)
    camera.position.set(v.x, v.y, v.z)
    camera.rotation.set(v.pitch, v.yaw, v.roll, 'YXZ')
    // ignition shake (layered sines, as on the rail)
    const sh = cameraFx.shake
    if (sh > 0.001) {
      const t = s.t
      camera.position.x += (Math.sin(t * 41.3) * 0.6 + Math.sin(t * 73.1 + 1.7) * 0.4) * 0.028 * sh
      camera.position.y += (Math.sin(t * 47.9 + 0.6) * 0.6 + Math.sin(t * 89.3) * 0.4) * 0.028 * sh
    }
    // blend in from the pose we took over from
    if (s.blend < 1) {
      s.blend = Math.min(1, s.blend + dt / BLEND_IN)
      const k = s.blend * s.blend * (3 - 2 * s.blend)
      camera.position.lerpVectors(s.fromPos, camera.position, k)
      _q.copy(camera.quaternion)
      camera.quaternion.slerpQuaternions(s.fromQuat, _q, k)
    }
    const fov = BASE_FOV + v.fov + cameraFx.fov
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = clamp(fov, 30, 120)
      camera.updateProjectionMatrix()
    }
  })

  return null
}
