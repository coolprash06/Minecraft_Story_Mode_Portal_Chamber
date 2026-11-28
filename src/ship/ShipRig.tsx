/**
 * The player on the ship: the reusable first-person controller (src/player) on the ship's
 * collision world, with the hall's `freeInput` (one input and one pointer lock across the hall and
 * the world, so a Free Roam entry arrives already playing). Always Free Roam here.
 *
 *  • Arrival (journey → 'world'): you step out of the deck portal facing aft. The camera eases
 *    out of the opening, the field of view settles, the pulse vignette and the portal's spiral
 *    fade, the frame flares. Reduced motion: none of that; the warp screen simply fades.
 *  • Leaving (development exit): jump into the deck portal (the sill is a 1-block step, as in the
 *    hall) → the hall's crossing (stretch, swirl, whiteout) → leaveWorld(). The pause menu's
 *    "Return to Corridor" fades to the veil colour instead (`exitShip('menu')`).
 *  • ?bench=N: once the arrival has settled, pans a full turn at the pose in N s, or with &fixed
 *    holds it. ?x ?y (eye height) ?z ?yaw ?pitch set the pose (default: the arrival spot).
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import type { PerspectiveCamera } from 'three'
import { playSfx } from '../audio/sfx'
import { freeInput } from '../controls/FreeRig'
import { BASE_FOV } from '../controls/GlideRig'
import { REDUCED_MOTION } from '../lib/device'
import { clamp } from '../lib/random'
import { PLAYER, PlayerController, type ViewPose } from '../player/PlayerController'
import { leaveWorld } from '../state/game'
import { appStore } from '../state/store'
import { BENCH_SECONDS } from '../ui/Perf'
import { DECK, PORTAL, SPAWN } from './constants'
import { buildShipCollision } from './deck'
import { shipFx, shipStore } from './shipFx'

const params = new URLSearchParams(window.location.search)
const num = (k: string, d: number) => {
  const v = params.get(k)
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) ? n : d
}
const BENCH_FIXED = BENCH_SECONDS > 0 && params.has('fixed')
const BENCH_POSE = {
  x: num('x', SPAWN.x),
  y: num('y', DECK.y + PLAYER.eye),
  z: num('z', SPAWN.z),
  yaw: (num('yaw', (SPAWN.yaw * 180) / Math.PI) * Math.PI) / 180,
  pitch: (clamp(num('pitch', 0), -89, 89) * Math.PI) / 180,
}
/** How far back into the opening the camera starts on arrival (m), and the FOV it settles from. */
const ARRIVE_BACK = 1.9
const ARRIVE_FOV = 14
const JUMP_FOV = 28

/** The pause menu's exit (and anything else that leaves the ship without the portal). */
export const shipControl = { exit: (_how: 'portal' | 'menu') => {} }

export function ShipRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const st = useRef({
    player: null as PlayerController | null,
    view: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0 } as ViewPose,
    /** Arrival: camera offset back into the portal (m). */
    back: REDUCED_MOTION ? 0 : ARRIVE_BACK,
    /** Exit: camera pushed forward into the opening (m). */
    push: 0,
    control: false,
    exiting: false,
    benchT: -1,
    prompt: '',
  })

  useEffect(() => {
    const s = st.current
    const world = buildShipCollision(
      () => shipControl.exit('portal'),
      () => true,
    )
    const player = new PlayerController(world, {
      onStep: (surface, at) => playSfx('step', { at, surface }),
      onJump: (at) => playSfx('jump', { at }),
      onLand: (impact, surface, at) => {
        if (impact > 3) playSfx('land', { at, surface, impact })
      },
    })
    player.reducedMotion = REDUCED_MOTION
    player.place(SPAWN.x, DECK.y + 0.05, SPAWN.z, SPAWN.yaw, 0)
    s.player = player
    shipStore.set({ prompt: '', arrived: false, benchReady: false })
    Object.assign(shipFx, { pulse: 0, warp: 0, flash: 0, bloom: 0, fov: REDUCED_MOTION ? 0 : ARRIVE_FOV, spiral: REDUCED_MOTION ? 0 : 1, flare: 0 })
    if (params.has('debug')) Object.assign(window, { __ship: { player, store: appStore, shipStore } })

    let tl: gsap.core.Timeline | null = null
    const arrive = () => {
      tl?.kill()
      playSfx('arrive')
      const settled = () => {
        s.control = true
        shipStore.set({ arrived: true })
        // the bench waits for the warp screen's fade and the arrival to be over
        gsap.delayedCall(1.2, () => shipStore.set({ benchReady: true }))
      }
      if (REDUCED_MOTION) {
        settled()
        return
      }
      tl = gsap
        .timeline({ onComplete: settled })
        .to(s, { back: 0, duration: 0.85, ease: 'power2.out' }, 0.1)
        .to(shipFx, { fov: 0, duration: 1.2, ease: 'power3.out' }, 0.1)
        .fromTo(shipFx, { pulse: 0.7 }, { pulse: 0, duration: 1.4, ease: 'power2.out' }, 0)
        .fromTo(shipFx, { bloom: 0.3 }, { bloom: 0, duration: 1.2, ease: 'power2.out' }, 0)
        .to(shipFx, { spiral: 0, duration: 1.6, ease: 'power2.inOut' }, 0)
        .fromTo(shipFx, { flare: 1 }, { flare: 0, duration: 1.4, ease: 'power2.inOut' }, 0)
    }

    shipControl.exit = (how) => {
      if (s.exiting || appStore.get().journey !== 'world') return
      s.exiting = true
      s.control = false
      shipStore.set({ prompt: '' })
      tl?.kill()
      if (how === 'menu' || REDUCED_MOTION) {
        // a plain fade to the veil colour
        tl = gsap.timeline().to(shipFx, { flash: 1, duration: how === 'menu' ? 0.35 : 0.9, ease: 'power1.in' }).call(leaveWorld)
        return
      }
      // the hall's Free Roam crossing: stretch, swirl and whiteout as you pass the surface
      playSfx('whoosh', { at: PORTAL.center, color: shipFx.color })
      tl = gsap
        .timeline()
        .to(s, { push: 0.6, duration: 0.45, ease: 'power2.in' }, 0)
        .to(shipFx, { fov: JUMP_FOV, duration: 0.45, ease: 'power2.in' }, 0)
        .to(shipFx, { spiral: 1, warp: 1, pulse: 0.6, bloom: 0.35, duration: 0.3, ease: 'power1.in' }, 0)
        .to(shipFx, { flash: 1, duration: 0.4, ease: 'power1.in' }, 0.05)
        .call(leaveWorld, [], 0.45)
    }

    // arrival: once the world is showing
    let last = appStore.get().journey
    if (last === 'world') arrive()
    const off = appStore.subscribe(() => {
      const j = appStore.get().journey
      if (j !== last && j === 'world') arrive()
      last = j
    })
    return () => {
      off()
      tl?.kill()
      gsap.killTweensOf([s, shipFx])
      shipControl.exit = () => {}
    }
  }, [])

  useFrame((_, dt) => {
    const s = st.current
    const player = s.player
    if (!player) return
    const a = appStore.get()
    const inWorld = a.journey === 'world'
    const playing = inWorld && s.control && !s.exiting && a.freeLock === 'locked' && BENCH_SECONDS === 0
    if (inWorld) freeInput.enabled = playing
    if (playing) {
      const [lx, ly] = freeInput.takeLook()
      player.look(lx, ly)
      player.update(dt, freeInput.move())
      // safety net: never fall forever (the bulwarks should make this impossible)
      if (player.y < DECK.bottom - 4) player.place(SPAWN.x, DECK.y + 0.05, SPAWN.z, SPAWN.yaw, 0)
    } else if (inWorld) freeInput.takeLook()

    const v = player.viewPose(s.view)
    let { x, y, z, yaw, pitch } = v
    if (BENCH_SECONDS > 0 && shipStore.get().benchReady) {
      ;({ x, y, z, yaw, pitch } = BENCH_POSE)
      if (!BENCH_FIXED) {
        if (s.benchT < 0) s.benchT = 0
        s.benchT += dt
        yaw += (Math.PI * 2 * Math.min(1, s.benchT / BENCH_SECONDS))
      }
    }
    // arrival: eased back out of the opening; exit: pushed forward into it
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const off = s.push - s.back
    camera.position.set(x + fx * off, y, z + fz * off)
    camera.rotation.set(pitch, yaw, v.roll, 'YXZ')
    const fov = clamp(BASE_FOV + v.fov + shipFx.fov, 30, 120)
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    // the dev exit's prompt: near the portal and looking at it
    let prompt = ''
    if (playing) {
      const dx = PORTAL.center[0] - x
      const dz = PORTAL.z - z
      const d = Math.hypot(dx, dz)
      const facing = (dx * fx + dz * fz) / Math.max(d, 1e-3)
      if (d < 5.5 && facing > 0.55) prompt = 'Jump in to return to the Hall'
    }
    if (prompt !== s.prompt) shipStore.set({ prompt: (s.prompt = prompt) })
  })

  return null
}
