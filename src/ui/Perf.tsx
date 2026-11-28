import { useEffect, useRef, useState } from 'react'
import { gpuStats } from '../scene/GpuTimer'

const params = new URLSearchParams(window.location.search)
/** ?bench=N: seconds of recording. */
export const BENCH_SECONDS = Number(params.get('bench')) || 0

/** The pixel ratio the canvas actually renders at (backing store ÷ CSS size) and its size. */
function renderRes(selector: string) {
  const c = document.querySelector<HTMLCanvasElement>(selector)
  if (!c || !c.clientWidth) return 'render ?'
  return `render ${c.width}×${c.height} @${(c.width / c.clientWidth).toFixed(2)} (dpr ${window.devicePixelRatio})`
}

function gpuName(selector: string) {
  const gl = document.querySelector<HTMLCanvasElement>(selector)?.getContext('webgl2')
  const ext = gl?.getExtension('WEBGL_debug_renderer_info')
  return (ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown GPU').replace(/\s+/g, ' ')
}

/**
 * ?debug: live FPS + frame time. ?bench=N: once `ready`, records every frame for N seconds (the
 * hall glides its full rail meanwhile; a 3D world pans or holds its pose), then shows (and puts in
 * the tab title) the GPU and frame-time stats. `canvas`: selector of the canvas being measured.
 */
export function Perf({ ready, canvas, bench }: { ready: boolean; canvas: string; bench: number }) {
  const [debug] = useState(() => params.has('debug'))
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
        const result = `BENCH ${gpuSummary(gpuStats.samples)} · ${(1000 / avg).toFixed(1)} fps avg · median ${q(0.5)} / p90 ${q(0.9)} / p99 ${q(0.99)} ms · ${slow} frames >33ms of ${f.length} · ${window.innerWidth}×${window.innerHeight} · ${renderRes(canvas)} · ${gpuName(canvas)}`
        frames.current = []
        document.title = result
        setText(result)
        console.info(result)
        if (!debug) return
      }
      if (debug && t - windowStart >= 500) {
        const fps = `${Math.round((count * 1000) / (t - windowStart))} fps · ${((t - windowStart) / count).toFixed(1)} ms · ${gpuSummary(gpuStats.samples.slice(-30))} · ${renderRes(canvas)}`
        setText((prev) => (prev.startsWith('BENCH') ? prev : fps))
        count = 0
        windowStart = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [debug, bench, ready, canvas])
  if (!text) return null
  return (
    <div id="perf" className="absolute bottom-4 left-4 bg-black/50 px-2 font-term text-lg text-[#7dff9a]">
      {text}
    </div>
  )
}
