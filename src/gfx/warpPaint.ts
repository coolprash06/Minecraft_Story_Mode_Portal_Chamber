/**
 * The warp screen's tunnel painter (shared by the warp worker and the main-thread fallback):
 * square motes streaming out of the centre in the portal's tones over a background that goes
 * whiteout → the saturated portal colour → a deep tint; going home it rushes and brightens back
 * into the whiteout at the end. With reduced motion: a still tint and barely drifting motes.
 * No DOM: it draws on any 2D context (an OffscreenCanvas in the worker).
 */
import { hexToRgb, tonesOf, WarpTunnel } from './dimensionArt'

export interface WarpParams {
  w: number
  h: number
  dir: 'out' | 'home'
  /** Portal colour and the whiteout colour (sRGB hex). */
  color: string
  flash: string
  reduced: boolean
  /** The home warp's length (s): the brightening is timed to end with it. */
  homeTime: number
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export function warpPainter(p: WarpParams) {
  const tunnel = new WarpTunnel(420)
  const tones = tonesOf(p.color)
  const flash = hexToRgb(p.flash)
  const mid = hexToRgb(p.color).map((v) => v * 0.55)
  const deep = hexToRgb(p.color).map((v) => v * 0.1)
  // the reduced-motion veil's tint (= darken(color, 0.82))
  const still = hexToRgb(p.color).map((v) => v * 0.18)
  const lerp = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')
  const glowStop = tones[2].replace(/,1\)$/, ',0.35)')

  return (ctx: Ctx2D, t: number, dt: number) => {
    const { w, h } = p
    let bg: string
    let speed: number
    if (p.reduced) {
      bg = lerp(still, still, 0)
      speed = 0.12
    } else {
      // the whiteout settles into a deep tint as we rush through …
      const k1 = Math.min(1, t / 0.22)
      const k2 = Math.min(1, Math.max(0, (t - 0.22) / 0.6))
      bg = k2 > 0 ? lerp(mid, deep, 1 - (1 - k2) * (1 - k2)) : lerp(flash, mid, k1 * k1)
      speed = 3.4 - 2.0 * Math.min(1, t / 0.9)
      // … and, going home, rushes and brightens back into the whiteout at the end
      if (p.dir === 'home') {
        const k3 = Math.min(1, Math.max(0, (t - (p.homeTime - 0.55)) / 0.5))
        if (k3 > 0) bg = lerp(deep, flash, k3 * k3)
        speed += 2.2 * Math.max(0, t - (p.homeTime - 0.6))
      }
    }
    tunnel.step(ctx as CanvasRenderingContext2D, w, h, dt, speed, `rgb(${bg})`, tones, 0.3)
    // a soft glow at the vanishing point
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.45)
    g.addColorStop(0, glowStop)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}
