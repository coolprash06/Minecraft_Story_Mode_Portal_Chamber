/**
 * Paints the warp screen's tunnel on an OffscreenCanvas, off the main thread. While a 3D world
 * loads behind the warp (meshing, the first frames, shader compiles), the main thread can stall
 * for tens of milliseconds; the tunnel keeps streaming regardless.
 *
 * Messages in: { canvas, params } to start, 'stop' to end.
 */
import { warpPainter, type WarpParams } from '../gfx/warpPaint'

let stopped = false
const raf: (f: (t: number) => void) => void =
  typeof self.requestAnimationFrame === 'function' ? (f) => self.requestAnimationFrame(f) : (f) => setTimeout(() => f(performance.now()), 16)

self.onmessage = (e: MessageEvent<{ canvas: OffscreenCanvas; params: WarpParams } | 'stop'>) => {
  if (e.data === 'stop') {
    stopped = true
    return
  }
  const { canvas, params } = e.data
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const paint = warpPainter(params)
  let start = -1
  let prev = 0
  const frame = (ts: number) => {
    if (stopped) return
    raf(frame)
    if (start < 0) start = prev = ts
    const dt = Math.min(0.05, (ts - prev) / 1000)
    prev = ts
    paint(ctx, (ts - start) / 1000, dt)
  }
  raf(frame)
}
