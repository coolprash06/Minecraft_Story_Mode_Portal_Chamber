/**
 * Mission 1, Pirates in the Caribbean: the world behind portal 0. Its own lazy chunk (App's
 * WorldHost mounts it from the start of the warp, which is its loading screen, and unmounts it
 * behind the warp home), with its own canvas, frame driver, scene, lights, post stack, collision
 * and spawn point. Nothing here touches the hall's GPU state; the hall's canvas simply pauses.
 *
 * Loading (reported to the warp screen through state/world):
 *  1. the chunk (usually prefetched) → 2. textures, the deck, the island, the portal frame, built
 *  a slice per animation frame so the warp tunnel keeps moving → 3. the canvas, and every program
 *  compiled asynchronously → 4. a few frames drawn → ready. The warp screen then fades out over it.
 *
 * Stage 1: the open sea, the bright tropical sky, the island, a temporary flat deck and the blue
 * deck portal (arrival; for now also the way home, as is the pause menu's Return to Corridor).
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { advance, Canvas, useFrame, useThree } from '@react-three/fiber'
import { ACESFilmicToneMapping, HalfFloatType, SRGBColorSpace, WebGLRenderTarget, type BufferGeometry, type PerspectiveCamera } from 'three'
import { BASE_FOV } from '../controls/GlideRig'
import { OFF } from '../lib/debug'
import { PLAYER } from '../player/PlayerController'
import { canvasDpr } from '../scene/Experience'
import { GPU_TIMING, GpuTimer } from '../scene/GpuTimer'
import { requestFreeLock } from '../state/game'
import { appStore, useApp } from '../state/store'
import { reportWorldLoad, worldLoad } from '../state/world'
import { MenuButton } from '../ui/PauseMenu'
import { BENCH_SECONDS, Perf } from '../ui/Perf'
import { DECK, FAR, FOG_DENSITY, HORIZON_HEX, SPAWN } from './constants'
import { buildDeckGeometry, type DeckGeometry } from './deck'
import { buildPortalFrame, DeckPortal } from './DeckPortal'
import { buildIsland, type IslandAssets } from './island'
import { Sea } from './Sea'
import { ShipEffects } from './ShipEffects'
import { shipStore } from './shipFx'
import { ShipRig, shipControl } from './ShipRig'
import { Island, ShipLights, TempDeck } from './ShipScene'
import { Sky } from './Sky'
import { deckTextures, type DeckTextures } from './textures'

const params = new URLSearchParams(window.location.search)
/** ?shipshadow=basic: Basic (hard) sun shadows instead of PCF (measurement knob). */
const SHADOW_TYPE = params.get('shipshadow') === 'basic' ? 'basic' : 'percentage'
const MAX_STEP = 0.05

interface ShipAssets {
  textures: DeckTextures
  deck: DeckGeometry
  island: IslandAssets
  frame: BufferGeometry[]
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** Built one slice per animation frame, so the warp screen never stalls. */
async function buildAssets(): Promise<ShipAssets> {
  reportWorldLoad(0.25, 'Raising the deck…')
  await nextFrame()
  const textures = deckTextures()
  const deck = buildDeckGeometry()
  reportWorldLoad(0.32, 'Sighting land…')
  await nextFrame()
  const island = buildIsland()
  reportWorldLoad(0.48)
  await nextFrame()
  const frame = buildPortalFrame()
  reportWorldLoad(0.55, 'Painting the sky…')
  await nextFrame()
  return { textures, deck, island, frame }
}

function disposeAssets(a: ShipAssets) {
  Object.values(a.textures).forEach((t) => t.dispose())
  Object.values(a.deck).forEach((g) => g.dispose())
  a.island.geometry.dispose()
  a.island.coast.dispose()
  a.frame.forEach((g) => g.dispose())
}

export default function ShipWorld() {
  const journey = useApp((s) => s.journey)
  const visible = journey === 'world'
  const [assets, setAssets] = useState<ShipAssets | null>(null)
  useEffect(() => {
    let dead = false
    let built: ShipAssets | null = null
    buildAssets().then(
      (a) => {
        if (dead) return disposeAssets(a)
        built = a
        setAssets(a)
      },
      () => {
        if (!dead) worldLoad.failed = true
      },
    )
    return () => {
      dead = true
      if (built) disposeAssets(built)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[45] select-none" style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}>
      {assets && <ShipCanvas assets={assets} />}
      <ShipHud />
    </div>
  )
}

function ShipCanvas({ assets }: { assets: ShipAssets }) {
  const quality = useApp((s) => s.quality)
  const go = useMemo(() => ({ started: false }), [])
  return (
    <Canvas
      id="ship"
      className="!absolute inset-0"
      dpr={canvasDpr(quality)}
      frameloop="never"
      shadows={SHADOW_TYPE}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace, stencil: false }}
      camera={{ fov: BASE_FOV, near: 0.05, far: FAR, position: [SPAWN.x, DECK.y + PLAYER.eye, SPAWN.z] }}
    >
      <ShipDriver go={go} />
      <color attach="background" args={[HORIZON_HEX]} />
      <fogExp2 attach="fog" args={[HORIZON_HEX, FOG_DENSITY]} />
      <ShipLights />
      <ShipRig />
      {!OFF.has('deck') && <TempDeck geo={assets.deck} tex={assets.textures} />}
      <DeckPortal frame={assets.frame} />
      {!OFF.has('island') && <Island geometry={assets.island.geometry} />}
      {!OFF.has('sea') && <Sea coast={assets.island.coast} />}
      {!OFF.has('sky') && <Sky />}
      <ShipEffects />
      {GPU_TIMING && <GpuTimer />}
      <ShipReady go={go} />
    </Canvas>
  )
}

/**
 * This canvas's own frame loop (the hall's driver only advances the hall). It starts once every
 * program is compiled; GSAP is still ticked by the hall's driver, which never stops.
 */
function ShipDriver({ go }: { go: { started: boolean } }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    let raf = 0
    let last = -1
    let t = 0
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick)
      const dt = last < 0 ? 0 : Math.min(Math.max((ts - last) / 1000, 0), MAX_STEP)
      last = ts
      if (!go.started) return
      t += dt
      advance(t, false, get())
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [get, go])
  return null
}

/** Compiles every program asynchronously (with a half-float target bound, as the composer renders), then lets frames run. */
function ShipReady({ go }: { go: { started: boolean } }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const frames = useRef(0)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      reportWorldLoad(0.6, 'Painting the sky…')
      const rt = new WebGLRenderTarget(256, 160, { type: HalfFloatType })
      const prev = gl.getRenderTarget()
      gl.setRenderTarget(rt)
      const compiled = gl.compileAsync(scene, camera)
      gl.setRenderTarget(prev)
      try {
        await compiled
      } catch {
        /* falls back to compiling on the first frame */
      }
      rt.dispose()
      if (cancelled) return
      reportWorldLoad(0.85, 'The far side opens…')
      go.started = true
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera, go])
  useFrame(() => {
    if (!go.started || worldLoad.ready) return
    if (++frames.current >= 3) {
      reportWorldLoad(1)
      worldLoad.ready = true
    }
  })
  return null
}

/* ───────────────────────────── HUD and menu ───────────────────────────── */

const useShip = <U,>(sel: (s: ReturnType<typeof shipStore.get>) => U) => useSyncExternalStore(shipStore.subscribe, () => sel(shipStore.get()))

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move (where you look)'],
  ['Mouse', 'Look around'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump · jump into the portal to go home (dev)'],
  ['Esc', 'Pause'],
]

function ShipHud() {
  const journey = useApp((s) => s.journey)
  const lock = useApp((s) => s.freeLock)
  const arrived = useShip((s) => s.arrived)
  const prompt = useShip((s) => s.prompt)
  const benchReady = useShip((s) => s.benchReady)
  const playing = lock === 'locked'
  const started = useRef(false)
  if (playing && journey === 'world') started.current = true
  const [panel, setPanel] = useState<'menu' | 'controls'>('menu')
  const menu = journey === 'world' && arrived && !playing && BENCH_SECONDS === 0

  useEffect(() => {
    if (!menu) setPanel('menu')
  }, [menu])
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel('menu')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  const toCorridor = () => {
    // you come home in Free Roam: this click is the gesture that keeps the mouse locked
    appStore.set({ mode: 'free' })
    requestFreeLock()
    shipControl.exit('menu')
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-4 top-4 flex flex-col gap-2 sm:left-6 sm:top-6">
        <p className="font-term text-lg tracking-[0.25em] text-[#eaf6ff]/85" style={{ textShadow: '2px 2px 0 #0a2a40' }}>
          DIMENSION I
        </p>
        <h1 className="font-pixel text-[10px] tracking-[0.2em] text-[#f6fbff] sm:text-xs" style={{ textShadow: '2px 2px 0 #0a2a40' }}>
          PIRATES IN THE CARIBBEAN
        </h1>
        <span className="w-fit border-2 border-black/60 bg-black/45 px-2 py-1 font-pixel text-[9px] tracking-widest text-[#ffd27a]">FREE ROAM</span>
      </div>
      {arrived && (
        <p className="absolute inset-x-0 bottom-6 px-4 text-center font-term text-lg tracking-wider text-[#f2f8ff]/80 sm:text-xl" style={{ textShadow: '2px 2px 0 #0a2a40' }}>
          WASD move · Shift sprint · Space jump &nbsp;·&nbsp; Esc pause
        </p>
      )}
      {playing && arrived && (
        <svg viewBox="0 0 9 9" className="absolute left-1/2 top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2" shapeRendering="crispEdges" aria-hidden style={{ mixBlendMode: 'difference' }}>
          <path d="M4 0h1v3H4zM4 6h1v3H4zM0 4h3v1H0zM6 4h3v1H6z" fill="#f4f1ff" />
        </svg>
      )}
      {prompt && (
        <p className="absolute left-1/2 top-[calc(50%+22px)] -translate-x-1/2 border-2 border-black/60 bg-black/55 px-3 py-1 font-term text-xl text-[#eef1ff]" style={{ textShadow: '2px 2px 0 #000' }}>
          {prompt}
        </p>
      )}

      {menu && (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-[#04101c]/45 backdrop-blur-[2px]" role="dialog" aria-modal aria-label="Paused">
          <div className="flex w-[min(92vw,440px)] flex-col items-center gap-3">
            <h2 className="mb-2 font-pixel text-sm tracking-[0.25em] text-[#f2f8ff] sm:text-base" style={{ textShadow: '3px 3px 0 #000' }}>
              {started.current ? 'PAUSED' : 'ON DECK'}
            </h2>
            {panel === 'menu' ? (
              <>
                <MenuButton autoFocus onClick={requestFreeLock}>
                  {started.current ? 'Resume' : 'Click to play'}
                </MenuButton>
                <MenuButton onClick={() => setPanel('controls')}>Controls</MenuButton>
                <MenuButton onClick={toCorridor}>Return to Corridor</MenuButton>
                <p className="mt-1 h-6 font-term text-lg text-[#d6e6f5]/75" style={{ textShadow: '2px 2px 0 #000' }}>
                  {lock === 'refused' ? 'One moment… then Resume again' : ''}
                </p>
              </>
            ) : (
              <>
                <dl className="grid w-full grid-cols-[auto_1fr] gap-x-5 gap-y-1 border-[3px] border-[#06060b] bg-[#0b1624]/90 px-5 py-4 font-term text-xl text-[#e9f1fb]" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
                  {CONTROLS.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-[#ffd27a]">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <MenuButton autoFocus onClick={() => setPanel('menu')}>
                  Back
                </MenuButton>
              </>
            )}
          </div>
        </div>
      )}
      <Perf ready={benchReady} canvas="#ship canvas" bench={BENCH_SECONDS} />
    </div>
  )
}
