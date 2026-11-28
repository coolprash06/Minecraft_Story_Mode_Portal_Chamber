import { memo, useEffect } from 'react'
import { advance, Canvas, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { ACESFilmicToneMapping, HalfFloatType, SRGBColorSpace, WebGLRenderTarget, type PerspectiveCamera } from 'three'
import { COLORS, FOG_DENSITY } from '../config/theme'
import { EntryRig } from '../controls/EntryRig'
import { FreeRig } from '../controls/FreeRig'
import { BASE_FOV, GlideRig } from '../controls/GlideRig'
import { Interaction } from '../controls/Interaction'
import { OFF } from '../lib/debug'
import { appStore, useApp, type Quality } from '../state/store'
import { hall } from '../world/layout'
import { Atmosphere } from './Atmosphere'
import { Corridor } from './Corridor'
import { Banners, Carpet, Runners } from './Decor'
import { Effects } from './Effects'
import { Finale } from './Finale'
import { Flames } from './Flames'
import { GPU_TIMING, GpuTimer } from './GpuTimer'
import { Hanging } from './Hanging'
import { HeldItem } from './HeldItem'
import { ItemFrames } from './ItemFrames'
import { Lighting } from './Lighting'
import { PortalFx } from './PortalFx'
import { Portals } from './Portals'
import { Props } from './Props'

/**
 * Shadow map type: Basic (a plain depth cube), filtered softly by our own 4-tap filter (gfx/shadowFilter):
 * the hardware depth-compare path that PCF uses is the expensive part on the target iGPU.
 * ?shadowtype=percentage restores three's PCF filter (the previous look; debug knob).
 */
const SHADOW_TYPE = (new URLSearchParams(window.location.search).get('shadowtype') ?? 'basic') as 'basic' | 'percentage' | 'soft'

/** Pixel-ratio ceiling per quality tier (fixed for the session). */
const DPR_CAP = { high: 1.5, low: 1.0 } as const
/** ?dpr=N (measurement knob): renders at exactly this pixel ratio, ignoring the cap. */
const DPR_OVERRIDE = Number(new URLSearchParams(window.location.search).get('dpr')) || 0

/** The canvas pixel ratio for a quality tier (the hall's and every 3D world's). */
export const canvasDpr = (quality: Quality) => (DPR_OVERRIDE > 0 ? DPR_OVERRIDE : Math.min(window.devicePixelRatio || 1, DPR_CAP[quality]))

/** The whole 3D scene. memo(): HUD state changes never re-render the Canvas. */
export const Experience = memo(function Experience() {
  const quality = useApp((s) => s.quality)
  const dpr = canvasDpr(quality)
  return (
    <Canvas
      id="hall"
      className="!fixed inset-0"
      dpr={dpr}
      frameloop="never"
      shadows={SHADOW_TYPE}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace, stencil: false }}
      camera={{ fov: BASE_FOV, near: 0.05, far: 140, position: [0, hall.rail.y, hall.rail.zStart] }}
    >
      <FrameDriver />
      <color attach="background" args={[COLORS.fog]} />
      <fogExp2 attach="fog" args={[COLORS.fog, FOG_DENSITY]} />
      <Lighting />
      <GlideRig />
      <EntryRig />
      <FreeRig />
      {/* after the rigs: picks against this frame's camera */}
      <Interaction />
      <Corridor />
      {!OFF.has('carpet') && <Carpet />}
      {!OFF.has('runners') && <Runners />}
      {!OFF.has('props') && <Props />}
      {!OFF.has('hanging') && <Hanging />}
      {!OFF.has('banners') && <Banners />}
      {!OFF.has('finale') && <Finale />}
      <Portals />
      {!OFF.has('portalfx') && <PortalFx />}
      {!OFF.has('frames') && <ItemFrames />}
      {!OFF.has('held') && <HeldItem />}
      {!OFF.has('flames') && <Flames />}
      {!OFF.has('dust') && <Atmosphere />}
      <Effects />
      {GPU_TIMING && <GpuTimer />}
      <ReadySignal />
    </Canvas>
  )
})

/** Longest step (s) any animation advances in one frame; longer gaps count as a pause. */
const MAX_STEP = 0.05

/** Frames rendered after the scene is ready before the 3D view may pause (post shaders compile). */
const WARM_FRAMES = 20

/**
 * The single frame loop (as in the Breaking Bad project): GSAP and R3F advance from the same
 * vsync-aligned rAF timestamp, so camera motion never micro-stutters against tweens.
 * While the warp / dimension screens or a 3D world cover the canvas, the 3D view stops rendering
 * (GSAP keeps running for the screens and the world); it resumes the moment the journey turns back
 * towards the hall. It advances this canvas's root only: a 3D world's canvas has a driver of its own.
 */
function FrameDriver() {
  const get = useThree((s) => s.get)
  useEffect(() => {
    gsap.ticker.remove(gsap.updateRoot)
    let raf = 0
    let last = -1
    let gsapTime = gsap.ticker.time
    let sceneTime = 0
    let readyFrames = 0
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick)
      const dt = last < 0 ? 0 : Math.min(Math.max((ts - last) / 1000, 0), MAX_STEP)
      last = ts
      gsapTime += dt
      gsap.updateRoot(gsapTime)
      const st = appStore.get()
      if (st.sceneReady && readyFrames < WARM_FRAMES) readyFrames++
      const j = st.journey
      const covered = j === 'warp' || j === 'dimension' || j === 'world' || j === 'leaving'
      if (covered && readyFrames >= WARM_FRAMES) return
      sceneTime += dt
      advance(sceneTime, true, get())
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      gsap.ticker.add(gsap.updateRoot)
    }
  }, [get])
  return null
}

/**
 * Compiles every program behind the loading veil (with an off-screen half-float target bound,
 * exactly like the composer's frames), renders warm-up frames looking both ways down the hall,
 * then flags the scene ready.
 */
function ReadySignal() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  useEffect(() => {
    let cancelled = false
    let raf = 0
    const run = async () => {
      const rt = new WebGLRenderTarget(256, 160, { type: HalfFloatType })
      const prev = gl.getRenderTarget()
      gl.setRenderTarget(rt)
      const compiled = gl.compileAsync(scene, camera)
      gl.setRenderTarget(prev)
      try {
        await compiled
      } catch {
        /* falls back to compiling on first render */
      }
      if (cancelled) return rt.dispose()
      const saved = camera.quaternion.clone()
      for (const yaw of [0, Math.PI]) {
        camera.rotation.set(0, yaw, 0, 'YXZ')
        camera.updateMatrixWorld()
        gl.setRenderTarget(rt)
        gl.render(scene, camera)
      }
      gl.setRenderTarget(prev)
      camera.quaternion.copy(saved)
      rt.dispose()
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => appStore.set({ sceneReady: true }))
      })
    }
    void run()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [gl, scene, camera])
  return null
}
