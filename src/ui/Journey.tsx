/**
 * The dimension side of a portal journey (DOM over the canvas):
 *  • Veil: a flat colour over the canvas. Normally the whiteout colour, so the 3D whiteout hands
 *    over to it seamlessly; with reduced motion it is a dark tint of the portal colour and simply
 *    fades in and out.
 *  • WarpScreen (~2.4 s): square motes stream out of the centre in the portal's tones while the
 *    whiteout settles to a deep tint, with original status lines and a chunky progress bar.
 *  • DimensionScreen: the placeholder for the world behind the portal (config/dimensions.ts), with
 *    "Return to Corridor" (Esc also returns).
 */
import { useEffect, useRef, useState } from 'react'
import { dimensionFor } from '../config/dimensions'
import { flashColorFor } from '../controls/EntryRig'
import { darken, drawSea, hexToRgb, tonesOf, WarpTunnel } from '../gfx/dimensionArt'
import { REDUCED_MOTION } from '../lib/device'
import { arriveInDimension, returnToCorridor } from '../state/game'
import { useApp } from '../state/store'
import { textColor } from './Hotbar'

const WARP_TIME = 2.4
const WARP_LINES = ['Folding the corridor…', 'Following the current…', 'The far side opens…']

export function Journey() {
  const journey = useApp((s) => s.journey)
  const portal = useApp((s) => s.journeyPortal)
  const veil = useApp((s) => s.veil)
  const veilMs = useApp((s) => s.veilMs)
  // keep the last portal while screens fade out after the journey ends
  const last = useRef(portal >= 0 ? portal : 0)
  if (portal >= 0) last.current = portal
  const id = last.current

  const [showWarp, setShowWarp] = useState(false)
  useEffect(() => {
    if (journey === 'warp') return setShowWarp(true)
    // linger under the dimension screen while it fades in
    const t = setTimeout(() => setShowWarp(false), 900)
    return () => clearTimeout(t)
  }, [journey])

  const dimVisible = journey === 'dimension'
  const [dimMounted, setDimMounted] = useState(dimVisible)
  useEffect(() => {
    if (dimVisible) return setDimMounted(true)
    const t = setTimeout(() => setDimMounted(false), 500)
    return () => clearTimeout(t)
  }, [dimVisible])

  const color = dimensionFor(id).color
  const veilColor = REDUCED_MOTION ? darken(color, 0.82) : flashColorFor(id)

  return (
    <>
      <div
        aria-hidden
        className={`fixed inset-0 z-50 ${veil ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{ background: veilColor, transition: `opacity ${veilMs}ms ease` }}
      />
      {showWarp && <WarpScreen portalId={id} />}
      {dimMounted && <DimensionScreen portalId={id} visible={dimVisible} />}
    </>
  )
}

/* ───────────────────────────── warp screen ───────────────────────────── */

function WarpScreen({ portalId }: { portalId: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [line, setLine] = useState(0)
  const [progress, setProgress] = useState(0)
  const color = dimensionFor(portalId).color

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const w = 240
    const h = Math.max(100, Math.round((w * window.innerHeight) / window.innerWidth))
    c.width = w
    c.height = h
    const tunnel = new WarpTunnel(420)
    const tones = tonesOf(color)
    // whiteout → the saturated portal colour → a deep tint (never through grey)
    const from = hexToRgb(flashColorFor(portalId))
    const mid = hexToRgb(color).map((v) => v * 0.55) as [number, number, number]
    const to = hexToRgb(color).map((v) => v * 0.1) as [number, number, number]
    const lerp = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')
    let raf = 0
    let start = -1
    let prev = 0
    let arrived = false
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame)
      if (start < 0) start = prev = ts
      const t = (ts - start) / 1000
      const dt = Math.min(0.05, (ts - prev) / 1000)
      prev = ts
      // the whiteout settles into a deep tint as we rush through
      const k1 = Math.min(1, t / 0.22)
      const k2 = Math.min(1, Math.max(0, (t - 0.22) / 0.6))
      const bg = `rgb(${k2 > 0 ? lerp(mid, to, 1 - (1 - k2) * (1 - k2)) : lerp(from, mid, k1 * k1)})`
      const speed = 3.4 - 2.0 * Math.min(1, t / 0.9)
      tunnel.step(ctx, w, h, dt, speed, bg, tones, 0.3)
      // a soft glow at the vanishing point
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.45)
      g.addColorStop(0, tones[2].replace(/,1\)$/, ',0.35)'))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      setLine(Math.min(WARP_LINES.length - 1, Math.floor(t / (WARP_TIME / WARP_LINES.length))))
      setProgress(Math.min(1, Math.floor((t / WARP_TIME) * 20) / 20))
      if (!arrived && t >= WARP_TIME) {
        arrived = true
        arriveInDimension()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [portalId, color])

  return (
    <div className="fixed inset-0 z-50 select-none" role="status" aria-live="polite">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" style={{ imageRendering: 'pixelated' }} />
      <div className="absolute inset-x-0 bottom-[18%] flex flex-col items-center gap-4 px-4">
        <p className="font-term text-2xl tracking-wider text-[#e9edff] sm:text-3xl" style={{ textShadow: '2px 2px 0 #000' }}>
          {WARP_LINES[line]}
        </p>
        <div className="h-3 w-[min(70vw,360px)] border-[3px] border-[#06060b] bg-[#06060b]/70" style={{ boxShadow: `0 0 0 2px ${color}55` }}>
          <div className="h-full" style={{ width: `${progress * 100}%`, background: `linear-gradient(${textColor(color)} 0 35%, ${color} 35% 70%, ${darken(color, 0.35)} 70%)` }} />
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────── dimension placeholder ───────────────────────────── */

function DimensionScreen({ portalId, visible }: { portalId: number; visible: boolean }) {
  const dim = dimensionFor(portalId)
  const ready = useApp((s) => s.sceneReady)
  const canvas = useRef<HTMLCanvasElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  // backdrop: the sea scene (or the portal's own swirl), ~30 fps; one still frame with reduced motion
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const w = 256
    const h = 144
    c.width = w
    c.height = h
    const tunnel = dim.scene === 'void' ? new WarpTunnel(200) : null
    const tones = tonesOf(dim.color)
    const bg = darken(dim.color, 0.9)
    const draw = (t: number, dt: number) => {
      if (tunnel) tunnel.step(ctx, w, h, dt, 0.25, bg, tones, 0.08)
      else drawSea(ctx, w, h, t, dim.color)
    }
    if (REDUCED_MOTION) {
      draw(2.5, 0)
      return
    }
    let raf = 0
    let start = -1
    let lastDraw = -1
    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame)
      if (start < 0) start = ts
      if (lastDraw >= 0 && ts - lastDraw < 32) return
      const dt = lastDraw < 0 ? 0 : (ts - lastDraw) / 1000
      lastDraw = ts
      draw((ts - start) / 1000, dt)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [dim.scene, dim.color])

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => button.current?.focus({ preventScroll: true }), 400)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.repeat) returnToCorridor()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [visible])

  const accent = textColor(dim.color)
  return (
    <div
      role="dialog"
      aria-label={`${dim.numeral}: ${dim.name}`}
      className={`fixed inset-0 z-[55] select-none overflow-hidden transition-opacity ${visible ? 'opacity-100 duration-700' : 'pointer-events-none opacity-0 duration-300'}`}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
      {/* a soft vignette so the type reads over the sky */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(5,6,20,0.35), rgba(5,6,20,0) 55%), radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55))' }} />

      <div className={`absolute inset-x-0 top-[11%] flex flex-col items-center px-4 text-center ${visible && !REDUCED_MOTION ? 'animate-[dimrise_900ms_cubic-bezier(.2,.9,.3,1)_both_150ms]' : ''}`}>
        <p className="flex items-center gap-3 font-term text-xl tracking-[0.25em] sm:text-2xl" style={{ color: accent, textShadow: '2px 2px 0 #000' }}>
          <Diamond color={dim.color} /> {dim.numeral} <Diamond color={dim.color} />
        </p>
        <h1
          className="mt-4 max-w-[92vw] font-pixel leading-[1.5] text-[#eef1ff]"
          style={{ fontSize: 'clamp(16px, 3.1vw, 44px)', textShadow: `4px 4px 0 #0a0f2e, 0 0 22px ${dim.color}aa` }}
        >
          {dim.name}
        </h1>
        <div className="mt-5 flex items-center gap-2" aria-hidden>
          <span className="h-[3px] w-[min(18vw,140px)]" style={{ background: `linear-gradient(90deg, transparent, ${dim.color})` }} />
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[6px] w-[6px]" style={{ background: i === 1 ? accent : dim.color }} />
          ))}
          <span className="h-[3px] w-[min(18vw,140px)]" style={{ background: `linear-gradient(270deg, transparent, ${dim.color})` }} />
        </div>
        <p className="mt-5 font-term text-2xl text-[#e9e6f2] sm:text-3xl" style={{ textShadow: '2px 2px 0 #000' }}>
          {dim.blurb}
        </p>
        <p className="mt-1 font-term text-lg text-[#c9cdf0]/75 sm:text-xl" style={{ textShadow: '2px 2px 0 #000' }}>
          This dimension is still being built. Mission I — coming soon.
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-[9%] flex flex-col items-center gap-3 px-4">
        <button
          ref={button}
          type="button"
          disabled={!ready || !visible}
          onClick={returnToCorridor}
          className="dim-btn flex items-center gap-3 border-[3px] border-[#06060b] bg-[#2b2938]/90 px-5 py-4 font-pixel text-[10px] tracking-wider text-[#eef1ff] outline-none transition-[background,box-shadow] duration-150 enabled:cursor-pointer enabled:hover:bg-[#3a3750] disabled:opacity-60 sm:text-xs"
          style={{ ['--glow' as string]: dim.color }}
        >
          <svg viewBox="0 0 7 7" className="h-3 w-3" shapeRendering="crispEdges" aria-hidden style={{ fill: accent }}>
            <path d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h1v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
          </svg>
          {ready ? 'Return to Corridor' : 'Lighting the hall…'}
        </button>
        <p className="font-term text-lg text-[#c9cdf0]/60" style={{ textShadow: '2px 2px 0 #000' }}>
          Esc also returns
        </p>
      </div>
    </div>
  )
}

function Diamond({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 5 5" className="h-3 w-3" shapeRendering="crispEdges" aria-hidden style={{ fill: color }}>
      <path d="M2 0h1v1H2zM1 1h3v1H1zM0 2h5v1H0zM1 3h3v1H1zM2 4h1v1H2z" />
    </svg>
  )
}
