import { useEffect, useRef, useState } from 'react'
import { COARSE_POINTER } from '../lib/device'
import { gpuStats } from '../scene/GpuTimer'
import { toggleMode } from '../state/game'
import { useApp } from '../state/store'
import { Hotbar } from './Hotbar'
import { Prompt, Toasts } from './Prompt'

/** HUD: title, mode badge, controls hint, hover prompt, messages and the hotbar. */
export function Hud() {
  const mode = useApp((s) => s.mode)
  const playing = useApp((s) => s.freeLock) === 'locked'
  // fades away while entering a portal, and back once on the rail again
  const away = useApp((s) => s.journey) !== 'hall'
  return (
    <div className={`pointer-events-none fixed inset-0 z-10 select-none transition-opacity duration-500 ${away ? 'invisible opacity-0' : 'opacity-100'}`} style={{ transitionProperty: 'opacity, visibility' }}>
      <div className="absolute left-4 top-4 flex flex-col gap-2 sm:left-6 sm:top-6">
        <h1 className="font-pixel text-[10px] tracking-[0.2em] text-[#e9e6f2]/80 sm:text-xs" style={{ textShadow: '2px 2px 0 #000' }}>
          THE HALL OF PORTALS
        </h1>
        {COARSE_POINTER ? (
          <span className="w-fit border-2 border-black/60 bg-black/45 px-2 py-1 font-pixel text-[9px] tracking-widest text-[#ffd27a]">GLIDE</span>
        ) : (
          // the mode badge is also the toggle (F does the same)
          <button
            type="button"
            onClick={(e) => {
              // drop focus, so SPACE (jump) / Enter can't press it again
              e.currentTarget.blur()
              toggleMode()
            }}
            onKeyDown={(e) => e.code === 'Space' && e.preventDefault()}
            title={mode === 'glide' ? 'Switch to Free Roam (F)' : 'Switch to Glide (F)'}
            className="pointer-events-auto flex w-fit cursor-pointer items-center gap-2 border-2 border-black/60 bg-black/45 px-2 py-1 font-pixel text-[9px] tracking-widest text-[#ffd27a] outline-none hover:bg-black/65 focus-visible:shadow-[0_0_0_2px_#ffd27a]"
          >
            <span className="border border-[#ffd27a]/50 px-1 text-[8px] text-[#e9e6f2]/80">F</span>
            {mode === 'glide' ? 'GLIDE' : 'FREE ROAM'}
          </button>
        )}
      </div>
      <p
        className="absolute inset-x-0 px-4 text-center font-term text-lg tracking-wider text-[#e9e6f2]/60 sm:text-xl"
        style={{ textShadow: '2px 2px 0 #000', bottom: 'calc(clamp(40px, 3.3vw, 58px) + 46px)' }}
      >
        {mode === 'glide' ? (
          <>
            Scroll · W/S to glide &nbsp;·&nbsp; drag · A/D to look around &nbsp;·&nbsp; click to interact · 1–9 hold
            {!COARSE_POINTER && <> &nbsp;·&nbsp; F free roam</>}
          </>
        ) : (
          <>WASD move · Shift sprint · Space jump &nbsp;·&nbsp; E / click interact · 1–9 hold &nbsp;·&nbsp; F glide · Esc pause</>
        )}
      </p>
      {mode === 'free' && playing && <Crosshair />}
      <Toasts />
      <Hotbar />
      <Prompt />
      <Perf />
    </div>
  )
}

/** Free Roam's crosshair: a small pixel cross, inverted against the scene so it reads anywhere. */
function Crosshair() {
  return (
    <svg viewBox="0 0 9 9" className="absolute left-1/2 top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2" shapeRendering="crispEdges" aria-hidden style={{ mixBlendMode: 'difference' }}>
      <path d="M4 0h1v3H4zM4 6h1v3H4zM0 4h3v1H0zM6 4h3v1H6z" fill="#f4f1ff" />
    </svg>
  )
}

const params = new URLSearchParams(window.location.search)

/** The pixel ratio the canvas actually renders at (backing store ÷ CSS size) and its size. */
function renderRes() {
  const c = document.querySelector('canvas')
  if (!c || !c.clientWidth) return 'render ?'
  return `render ${c.width}×${c.height} @${(c.width / c.clientWidth).toFixed(2)} (dpr ${window.devicePixelRatio})`
}

function gpuName() {
  const gl = document.querySelector('canvas')?.getContext('webgl2')
  const ext = gl?.getExtension('WEBGL_debug_renderer_info')
  return (ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown GPU').replace(/\s+/g, ' ')
}

/**
 * ?debug: live FPS + frame time. ?bench=N: once the scene is ready, glides the full rail for N
 * seconds while recording every frame, then shows (and puts in the tab title) the average FPS
 * and the 95th-percentile frame time.
 */
function Perf() {
  const ready = useApp((s) => s.sceneReady)
  const [debug] = useState(() => params.has('debug'))
  const [bench] = useState(() => Number(params.get('bench')) || 0)
  const [text, setText] = useState('')
  const frames = useRef<number[]>([])
  useEffect(() => {
    if (!debug && !bench) return
    if (bench && !ready) return
    let raf = 0
    let last = performance.now()
    let windowStart = last
    let count = 0
    const start = last
    if (bench) gpuStats.samples.length = 0
    const gpuSummary = (g: number[]) => {
      if (!g.length) return 'GPU n/a'
      const s = [...g].sort((a, b) => a - b)
      return `GPU median ${s[s.length >> 1].toFixed(2)} / p90 ${s[Math.floor(s.length * 0.9)].toFixed(2)} ms · ${gpuStats.calls} calls ${(gpuStats.triangles / 1000).toFixed(0)}k tris`
    }
    const tick = (t: number) => {
      const dt = t - last
      last = t
      count++
      if (bench && t - start < bench * 1000) frames.current.push(dt)
      else if (bench && frames.current.length) {
        const f = frames.current.slice(1).sort((a, b) => a - b)
        const avg = f.reduce((a, b) => a + b, 0) / f.length
        const q = (x: number) => f[Math.min(f.length - 1, Math.floor(f.length * x))].toFixed(1)
        const slow = f.filter((d) => d > 33.4).length
        const result = `BENCH ${gpuSummary(gpuStats.samples)} · ${(1000 / avg).toFixed(1)} fps avg · median ${q(0.5)} / p90 ${q(0.9)} / p99 ${q(0.99)} ms · ${slow} frames >33ms of ${f.length} · ${window.innerWidth}×${window.innerHeight} · ${renderRes()} · ${gpuName()}`
        frames.current = []
        document.title = result
        setText(result)
        console.info(result)
        if (!debug) return
      }
      if (debug && t - windowStart >= 500) {
        const fps = `${Math.round((count * 1000) / (t - windowStart))} fps · ${((t - windowStart) / count).toFixed(1)} ms · ${gpuSummary(gpuStats.samples.slice(-30))} · ${renderRes()}`
        setText((prev) => (prev.startsWith('BENCH') ? prev : fps))
        count = 0
        windowStart = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [debug, bench, ready])
  if (!text) return null
  return (
    <div id="perf" className="absolute bottom-4 left-4 bg-black/50 px-2 font-term text-lg text-[#7dff9a]">
      {text}
    </div>
  )
}
