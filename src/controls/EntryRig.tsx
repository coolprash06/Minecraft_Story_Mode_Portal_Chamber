/**
 * Portal entry camera (takes over from GlideRig while store.journey ≠ 'hall').
 *
 * From Glide (click on a lit portal), one GSAP timeline:
 *  1. Leave the rail: glide along the aisle to the portal's runner, taking the shortest turn to face
 *     it. Spiral mode starts building on the surface.
 *  2. Walk the runner at a walking pace with head bob (a dip per footstep, a little sway and roll)
 *     and a footstep sound hook per stride. The pulse vignette fades in, the swirl warp starts,
 *     the light pool brightens and the motes stream back into the opening. Esc cancels during 1–2.
 *  3. Jump: a short crouch, then an arc up and forward over the frame's sill while the field of view
 *     stretches (to 90° at most), the warp peaks and the bloom swells.
 *  4. Cross: the whiteout (in the portal's colour) is complete just before the camera reaches the
 *     surface, so the brick behind it is never seen; the DOM veil takes over (crossInto).
 * Free Roam (later) enters with from = 'free': only beat 4 runs, from wherever the player is.
 *
 * Reduced motion: no bob, no FOV stretch, no warp, no shake; the screen simply fades into the
 * dimension and the camera never moves.
 *
 * Return: the camera is put back on the rail in front of the portal (still lit) behind the veil;
 * the veil drops to a matching whiteout that clears as the field of view settles, then GlideRig
 * takes over (blending from this pose, so nothing jumps).
 */
import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { Color, type PerspectiveCamera } from 'three'
import { playSfx } from '../audio/sfx'
import { PORTAL_COLORS } from '../config/portals'
import { cameraFx, portalFx, postFx, warpFx } from '../gfx/portalFx'
import { REDUCED_MOTION } from '../lib/device'
import { clamp } from '../lib/random'
import { onGame } from '../state/events'
import { backInHall, cancelEntry, crossInto } from '../state/game'
import { appStore } from '../state/store'
import { hall } from '../world/layout'
import { BASE_FOV, faceYaw, glideControl, RAIL_Y } from './GlideRig'

/** Eye height while walking (the rail floats a little higher). */
const EYE = 1.8
/** Walk speed (m/s) and stride (m): about 2.6 steps per second. */
const WALK_SPEED = 2.1
const STRIDE = 0.8
/** Where the walk ends and the jump starts / would land (|x|): the frame's surface is at |x| = 7. */
const TAKEOFF_X = 5.2
const LAND_X = 7.25
const JUMP_TIME = 0.62
const JUMP_HEIGHT = 0.55
/** Extra FOV (degrees): a slight widening while walking, then the stretch (62 + 28 = 90° cap). */
const WALK_FOV = 4
const JUMP_FOV = 28
/** Return: the FOV settles from this much wider as the whiteout clears. */
const RETURN_FOV = 14

type Stage = 'idle' | 'rail' | 'walk' | 'jump' | 'crossed' | 'cancel' | 'return' | 'fade'

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Whiteout colour for a portal: its colour lifted towards white (sRGB hex). */
export function flashColorFor(portalId: number) {
  const c = new Color(PORTAL_COLORS[hall.portals[portalId].color])
  return '#' + c.lerp(new Color('#ffffff'), 0.55).getHexString()
}

export function EntryRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera

  useEffect(() => {
    const pose = { x: 0, y: RAIL_Y, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 0 }
    /** Effect levels for the portal being entered; written to the shared fx objects each frame. */
    const fx = { spiral: 0, pulse: 0, warp: 0, flash: 0, bloom: 0, bob: 0, crouch: 0, hop: 0 }
    const run = { stage: 'idle' as Stage, portalId: -1, walkFrom: 0, steps: 0, tl: null as gsap.core.Timeline | null }

    const fromCamera = () => {
      pose.x = camera.position.x
      pose.y = camera.position.y
      pose.z = camera.position.z
      camera.rotation.reorder('YXZ')
      pose.yaw = camera.rotation.y
      pose.pitch = camera.rotation.x
      pose.roll = camera.rotation.z
      pose.fov = camera.fov - BASE_FOV - cameraFx.fov
    }
    const setColors = (id: number) => {
      warpFx.color = PORTAL_COLORS[hall.portals[id].color]
      warpFx.flashColor = flashColorFor(id)
    }
    const resetFx = () => {
      Object.assign(fx, { spiral: 0, pulse: 0, warp: 0, flash: 0, bloom: 0, bob: 0, crouch: 0, hop: 0 })
    }
    /** Write the effect levels to the shared fx objects (also on the last frame of a stage). */
    const apply = () => {
      const id = run.portalId
      if (id >= 0) portalFx.spiral[id] = fx.spiral
      warpFx.pulse = fx.pulse
      warpFx.warp = fx.warp
      warpFx.flash = fx.flash
      postFx.bloom = fx.bloom
    }
    const kill = () => {
      run.tl?.kill()
      run.tl = null
      gsap.killTweensOf([pose, fx])
    }

    const offEnter = onGame('enter', ({ portalId, from }) => {
      kill()
      const p = hall.portals[portalId]
      const s = p.side
      run.portalId = portalId
      setColors(portalId)
      fromCamera()
      resetFx()

      if (REDUCED_MOTION) {
        // a plain fade: the camera stays where it is
        run.stage = 'fade'
        appStore.set({ veil: true, veilMs: 900 })
        run.tl = gsap.timeline().call(() => crossInto(true), [], 0.95)
        return
      }

      const tl = gsap.timeline()
      run.tl = tl
      if (from === 'free') {
        // the player is already in the opening: stretch, whiteout, cross
        run.stage = 'jump'
        const fwd = { x: -Math.sin(pose.yaw), z: -Math.cos(pose.yaw) }
        tl.to(pose, { x: pose.x + fwd.x * 0.6, z: pose.z + fwd.z * 0.6, fov: JUMP_FOV, duration: 0.45, ease: 'power2.in' }, 0)
          .to(fx, { spiral: 1, warp: 1, pulse: 0.6, bloom: 0.35, duration: 0.3, ease: 'power1.in' }, 0)
          .to(fx, { flash: 1, duration: 0.4, ease: 'power1.in' }, 0.05)
          .call(cross, [], 0.45)
        return
      }

      const cz = p.center[2]
      const yawFace = pose.yaw + wrapPi(faceYaw(portalId) - pose.yaw)
      const turn = Math.abs(yawFace - pose.yaw)
      // 1. off the rail to the runner, turning to face the portal
      const d1 = clamp(0.7 + Math.abs(pose.z - cz) / 7 + turn * 0.25, 0.9, 2.8)
      run.stage = 'rail'
      tl.to(pose, { x: 0, y: RAIL_Y, z: cz, duration: d1, ease: 'sine.inOut' }, 0)
        .to(pose, { yaw: yawFace, pitch: 0, roll: 0, fov: 0, duration: d1, ease: 'power2.inOut' }, 0)
        .to(fx, { spiral: 0.4, duration: d1, ease: 'sine.in' }, 0)
        .call(() => playSfx('whoosh', { at: p.center, color: warpFx.color }), [], 0)

      // 2. walk the runner
      const walkX = s * TAKEOFF_X
      const d2 = TAKEOFF_X / WALK_SPEED
      tl.call(
        () => {
          run.stage = 'walk'
          run.walkFrom = pose.x
          run.steps = 0
        },
        [],
        d1,
      )
        .to(pose, { x: walkX, duration: d2, ease: 'power1.inOut' }, d1)
        .to(pose, { y: EYE, pitch: 0.07, fov: WALK_FOV, duration: d2, ease: 'sine.inOut' }, d1)
        .to(fx, { bob: 1, duration: 0.35, ease: 'sine.out' }, d1)
        .to(fx, { bob: 0, duration: 0.3, ease: 'sine.in' }, d1 + d2 - 0.3)
        .to(fx, { spiral: 1, pulse: 0.55, warp: 0.3, duration: d2, ease: 'sine.inOut' }, d1)

      // 3. jump: crouch, then the arc over the sill, the stretch and the whiteout
      const tj = d1 + d2
      tl.call(
        () => {
          run.stage = 'jump'
          playSfx('jump', { at: p.center, color: warpFx.color })
          playSfx('whoosh', { at: p.center, color: warpFx.color })
        },
        [],
        tj,
      )
        .to(fx, { crouch: 1, duration: 0.14, ease: 'power2.out' }, tj)
        .to(fx, { crouch: 0, duration: 0.16, ease: 'power2.in' }, tj + 0.14)
        .to(pose, { x: s * LAND_X, duration: JUMP_TIME, ease: 'none' }, tj + 0.16)
        .to(fx, { hop: 1, duration: JUMP_TIME, ease: 'none' }, tj + 0.16)
        .to(pose, { fov: JUMP_FOV, duration: JUMP_TIME * 0.8, ease: 'power2.in' }, tj + 0.16)
        .to(fx, { warp: 1, pulse: 0.7, bloom: 0.35, duration: JUMP_TIME * 0.7, ease: 'power1.in' }, tj + 0.1)
        // full whiteout at 80 % of the arc (|x| ≈ 6.84, still in front of the surface at 7)
        .to(fx, { flash: 1, duration: JUMP_TIME * 0.38, ease: 'power1.in' }, tj + 0.16 + JUMP_TIME * 0.42)
        .call(cross, [], tj + 0.16 + JUMP_TIME * 0.8)
    })

    function cross() {
      kill()
      run.stage = 'crossed'
      fx.flash = 1
      crossInto()
    }

    const offCancel = onGame('cancelEntry', () => {
      if (run.stage !== 'rail' && run.stage !== 'walk') return
      kill()
      run.stage = 'cancel'
      // glide back onto the rail where we are, the effects falling away
      run.tl = gsap
        .timeline({
          onComplete: () => {
            run.stage = 'idle'
            apply()
            glideControl.place(pose.z, pose.yaw)
            backInHall()
          },
        })
        .to(pose, { x: 0, y: RAIL_Y, pitch: 0, roll: 0, fov: 0, duration: 0.9, ease: 'power2.inOut' }, 0)
        .to(fx, { spiral: 0, pulse: 0, warp: 0, bloom: 0, bob: 0, duration: 0.7, ease: 'power2.out' }, 0)
    })

    const offReturn = onGame('return', ({ portalId }) => {
      kill()
      run.portalId = portalId
      setColors(portalId)
      resetFx()
      run.stage = 'return'
      const p = hall.portals[portalId]
      Object.assign(pose, { x: 0, y: RAIL_Y, z: p.center[2], yaw: faceYaw(portalId), pitch: 0, roll: 0, fov: REDUCED_MOTION ? 0 : RETURN_FOV })
      const done = () => {
        run.stage = 'idle'
        resetFx()
        apply()
        glideControl.place(pose.z, pose.yaw)
        backInHall()
      }
      if (REDUCED_MOTION) {
        // the veil fades away over the hall
        run.tl = gsap
          .timeline({ onComplete: done })
          .call(() => appStore.set({ veil: false, veilMs: 900 }), [], 0.1)
          .to({}, { duration: 1.0 }, 0.1)
        return
      }
      // the 3D whiteout matches the veil exactly: swap them once this pose has rendered, then clear
      fx.flash = 1
      const flare = { v: 1 }
      run.tl = gsap
        .timeline({ onComplete: done })
        .call(() => appStore.set({ veil: false, veilMs: 0 }), [], 0.08)
        .to(fx, { flash: 0, duration: 0.9, ease: 'power2.out' }, 0.08)
        .to(pose, { fov: 0, duration: 1.1, ease: 'power3.out' }, 0.08)
        .to(flare, { v: 0, duration: 1.4, ease: 'power2.inOut', onUpdate: () => void (portalFx.flash[portalId] = flare.v) }, 0.08)
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return
      if (run.stage === 'rail' || run.stage === 'walk') cancelEntry()
    }
    window.addEventListener('keydown', onKey)

    // per-frame: compose the pose (+ head bob and the jump arc) and write the effect levels
    frameHook.fn = () => {
      if (run.stage === 'idle') return
      let x = pose.x
      let y = pose.y
      let z = pose.z
      let pitch = pose.pitch
      let roll = pose.roll
      if (run.stage === 'walk' || run.stage === 'jump' || run.stage === 'cancel') {
        const walked = Math.abs(pose.x - run.walkFrom)
        const phase = (walked / STRIDE) * Math.PI
        const b = fx.bob
        // dip at each footfall, a little sway across the direction of travel, a hint of roll
        y += -Math.abs(Math.sin(phase)) * 0.045 * b
        const sway = Math.sin(phase) * 0.025 * b
        x += Math.cos(pose.yaw) * sway
        z += -Math.sin(pose.yaw) * sway
        roll += Math.sin(phase) * 0.007 * b
        if (run.stage === 'walk') {
          const steps = Math.floor(walked / STRIDE + 0.5)
          if (steps > run.steps) {
            run.steps = steps
            playSfx('step', { at: [x, 0, z] })
          }
        }
      }
      if (run.stage === 'jump' || run.stage === 'crossed') {
        y += -0.12 * fx.crouch + JUMP_HEIGHT * Math.sin(Math.PI * fx.hop)
        pitch += -0.1 * Math.sin(Math.PI * fx.hop)
      }
      camera.position.set(x, y, z)
      camera.rotation.set(pitch, pose.yaw, roll, 'YXZ')
      const fov = BASE_FOV + pose.fov + cameraFx.fov
      if (Math.abs(camera.fov - fov) > 1e-4) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      apply()
    }

    return () => {
      kill()
      offEnter()
      offCancel()
      offReturn()
      window.removeEventListener('keydown', onKey)
      frameHook.fn = null
    }
  }, [camera])

  useFrame(() => frameHook.fn?.())
  return null
}

const frameHook = { fn: null as null | (() => void) }
