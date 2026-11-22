/**
 * Pixel art for the dimension side (drawn on small 2D canvases, scaled up with pixelated sampling):
 *  • drawSea: an original sunset ocean (dithered sky bands, a striped setting sun, drifting clouds,
 *    twinkling stars, shimmering waves, the sun's glitter path) with a small ship bobbing on it;
 *  • WarpTunnel: square motes streaming out from the centre in the portal's tones (the warp
 *    screen, and the backdrop of a dimension that has no scene yet).
 * Everything is generated here; no images.
 */
import { hash3 } from '../lib/random'

type RGB = [number, number, number]

export const hexToRgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mixRgb = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

/* ───────────────────────────── the ship (original sprite) ───────────────────────────── */

/**
 * A small two-masted ship, 34 × 22 px. h: hull, H: hull trim, w: lit stern windows, m: mast,
 * s: sail, S: sail shade, r: rigging, p: pennant (portal colour).
 */
function shipSprite(flutter: number): string[] {
  const W = 34
  const H = 22
  const g = Array.from({ length: H }, () => Array(W).fill('.'))
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c
  }
  // hull: a tapered keel, a raised stern castle on the right, a bowsprit on the left
  for (let y = 15; y <= 20; y++) {
    const inset = y - 15
    for (let x = 3 + inset; x <= 31 - Math.floor(inset * 0.8); x++) put(x, y, 'h')
  }
  for (let x = 4; x <= 31; x++) put(x, 16, (x % 3 === 0 ? 'w' : 'H'))
  for (let y = 12; y <= 14; y++) for (let x = 24; x <= 32; x++) put(x, y, 'h')
  for (let x = 25; x <= 31; x += 2) put(x, 13, 'w')
  put(2, 15, 'h')
  for (let i = 0; i < 6; i++) put(2 - Math.floor(i * 0.5), 14 - i, 'm')
  // masts
  for (let y = 2; y <= 14; y++) {
    put(12, y, 'm')
    put(21, y, 'm')
  }
  // square sails, billowing a little (wider in the middle rows), shaded on the leeward side
  const sail = (cx: number, y0: number, rows: number, half: number) => {
    for (let r = 0; r < rows; r++) {
      const bulge = Math.round(Math.sin(((r + 0.5) / rows) * Math.PI) * 1.2)
      for (let x = cx - half - bulge; x <= cx + half + bulge; x++) put(x, y0 + r, x > cx + half - 1 ? 'S' : 's')
    }
  }
  sail(12, 3, 4, 3)
  sail(12, 8, 5, 4)
  sail(21, 4, 3, 3)
  sail(21, 8, 5, 4)
  // rigging from the bowsprit to the fore mast top, and between the masts
  for (let i = 0; i <= 9; i++) put(Math.round(0 + i * 1.2), Math.round(9 - i * 0.7), 'r')
  // pennant at the main mast top, two frames of flutter
  put(21, 1, 'm')
  put(22, 1, 'p')
  put(23, 1 + flutter, 'p')
  put(22, 2, 'p')
  return g.map((row) => row.join(''))
}

const SHIP_COLORS: Record<string, RGB> = {
  h: [22, 14, 30],
  H: [44, 28, 46],
  w: [255, 200, 96],
  m: [30, 20, 34],
  s: [70, 52, 92],
  S: [48, 36, 70],
  r: [40, 28, 44],
}

/* ───────────────────────────── the sunset sea ───────────────────────────── */

const SKY: RGB[] = [
  [10, 16, 52],
  [22, 30, 96],
  [52, 44, 128],
  [104, 58, 138],
  [176, 74, 126],
  [232, 112, 86],
  [255, 168, 84],
]
const SEA: RGB[] = [
  [40, 58, 150],
  [26, 40, 112],
  [16, 26, 78],
  [9, 15, 48],
]

/**
 * One frame of the sea scene into a w × h canvas context (pixel units). `t` in seconds; `accent`
 * is the portal colour (the pennant, the wave highlights).
 */
export function drawSea(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, accent: string) {
  const acc = hexToRgb(accent)
  const horizon = Math.round(h * 0.6)
  const sx = Math.round(w * 0.68)
  const sr = Math.round(h * 0.13)
  ctx.drawImage(seaBackdrop(w, h), 0, 0)
  // stars in the top of the sky
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash3(i, 1, 7) * w)
    const y = Math.floor(hash3(i, 2, 7) * horizon * 0.42)
    const tw = 0.5 + 0.5 * Math.sin(t * (1.2 + hash3(i, 3, 7) * 2.5) + i)
    if (tw < 0.35) continue
    ctx.fillStyle = css([235, 230, 255], 0.35 + 0.65 * tw)
    ctx.fillRect(x, y, 1, 1)
  }
  drawMoving(ctx, w, h, t, acc, horizon, sx, sr)
}

/** The static layers (sky bands, the sun, sea bands), drawn once per size. */
let backdrop: { key: string; canvas: HTMLCanvasElement } | null = null
function seaBackdrop(w: number, h: number) {
  const key = `${w}x${h}`
  if (backdrop?.key === key) return backdrop.canvas
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const horizon = Math.round(h * 0.6)
  const sx = Math.round(w * 0.68)
  const sr = Math.round(h * 0.13)
  // sky: dithered bands (a checker between neighbouring tones around each band edge)
  for (let y = 0; y < horizon; y++) {
    const f = (y / horizon) * (SKY.length - 1)
    const i = Math.min(SKY.length - 2, Math.floor(f))
    const k = f - i
    for (let x = 0; x < w; x += 1) {
      const dither = ((x + y) & 1) === 0 ? 0.25 : -0.25
      const c = k + dither * (k > 0.25 && k < 0.75 ? 1 : 0) > 0.5 ? SKY[i + 1] : SKY[i]
      ctx.fillStyle = css(c)
      ctx.fillRect(x, y, 1, 1)
    }
  }
  // the setting sun: a disc sitting on the horizon, its lower half cut by thin bands
  for (let y = -sr; y <= 0; y++) {
    const row = horizon + y
    if (-y < sr * 0.5 && -y % 4 === 1) continue
    const half = Math.floor(Math.sqrt(sr * sr - y * y))
    const c = mixRgb([255, 236, 160], [255, 150, 70], (y + sr) / sr)
    ctx.fillStyle = css(c)
    ctx.fillRect(sx - half, row, half * 2 + 1, 1)
  }
  for (let y = horizon; y < h; y++) {
    const f = ((y - horizon) / (h - horizon)) * (SEA.length - 1)
    const i = Math.min(SEA.length - 2, Math.floor(f))
    const c = mixRgb(SEA[i], SEA[i + 1], Math.round((f - i) * 3) / 3)
    ctx.fillStyle = css(c)
    ctx.fillRect(0, y, w, 1)
  }
  backdrop = { key, canvas }
  return canvas
}

function drawMoving(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, acc: RGB, horizon: number, sx: number, sr: number) {
  // drifting clouds (rounded pixel blocks), wrapping around
  const clouds = [
    { y: 0.16, w: 34, speed: 1.6, seed: 1 },
    { y: 0.27, w: 46, speed: 1.0, seed: 2 },
    { y: 0.38, w: 28, speed: 2.1, seed: 3 },
    { y: 0.47, w: 52, speed: 0.7, seed: 4 },
  ]
  for (const c of clouds) {
    const span = w + c.w
    const x0 = Math.round(((hash3(c.seed, 9, 9) * span - t * c.speed) % span + span) % span) - c.w
    const y0 = Math.round(h * c.y)
    const lit: RGB = c.y > 0.35 ? [255, 176, 150] : [196, 132, 190]
    const shade: RGB = c.y > 0.35 ? [150, 72, 118] : [92, 64, 140]
    for (let r = 0; r < 5; r++) {
      const inset = [6, 2, 0, 1, 4][r]
      const len = c.w - inset * 2 - (r === 0 ? Math.floor(c.w * 0.35) : 0)
      ctx.fillStyle = css(r < 3 ? lit : shade, 0.92)
      ctx.fillRect(x0 + inset + (r === 0 ? Math.floor(c.w * 0.15) : 0), y0 + r, Math.max(0, len), 1)
    }
  }
  // moving wave dashes on the sea, and the sun's glitter path
  for (let y = horizon + 1; y < h; y += 2) {
    const depth = (y - horizon) / (h - horizon)
    const len = 2 + Math.round(depth * 6)
    const gap = 9 + Math.round(depth * 14)
    const drift = Math.round(t * (3 + depth * 9) + hash3(y, 4, 4) * gap) % gap
    for (let x = -gap + drift; x < w; x += gap) {
      const k = hash3(Math.floor((x - drift) / gap), y, 5)
      if (k < 0.45) continue
      // near the sun's column: gold glitter; elsewhere: portal-blue highlights
      const near = Math.abs(x - sx) < sr * (0.6 + depth * 1.4)
      const glitter = near && Math.sin(t * 6 + x * 0.7 + y) > -0.2
      ctx.fillStyle = glitter ? css([255, 214, 120], 0.85) : css(mixRgb(acc, [255, 255, 255], 0.35), 0.28 + depth * 0.3)
      ctx.fillRect(x, y, len, 1)
    }
  }
  // the ship, bobbing and rocking gently on the horizon (left third)
  const sprite = shipSprite(Math.floor(t * 4) % 2)
  const bob = Math.round(Math.sin(t * 1.3) * 1.2)
  const tilt = Math.sin(t * 1.3 + 0.8) * 0.06
  const shipX = Math.round(w * 0.26)
  const shipY = horizon - 16 + bob
  for (let y = 0; y < sprite.length; y++) {
    const shift = Math.round((y - 16) * tilt)
    for (let x = 0; x < sprite[y].length; x++) {
      const ch = sprite[y][x]
      if (ch === '.') continue
      ctx.fillStyle = ch === 'p' ? css(acc) : css(SHIP_COLORS[ch])
      ctx.fillRect(shipX + x + shift, shipY + y, 1, 1)
    }
  }
  // a little foam where the hull meets the water
  ctx.fillStyle = css([200, 210, 255], 0.5)
  for (let x = 4; x < 31; x += 3) if (Math.sin(t * 3 + x) > 0) ctx.fillRect(shipX + x, shipY + 21, 2, 1)
}

/* ───────────────────────────── warp tunnel ───────────────────────────── */

export class WarpTunnel {
  private readonly n: number
  private readonly ang: Float32Array
  private readonly z: Float32Array
  private readonly tone: Uint8Array
  constructor(n = 260) {
    this.n = n
    this.ang = new Float32Array(n)
    this.z = new Float32Array(n)
    this.tone = new Uint8Array(n)
    for (let i = 0; i < n; i++) this.reset(i, Math.random())
  }
  private reset(i: number, z = 1) {
    this.ang[i] = Math.random() * Math.PI * 2
    this.z[i] = z * 0.95 + 0.05
    this.tone[i] = Math.floor(Math.random() * 4)
  }
  /**
   * Advance by dt at `speed` (1 = cruising) and draw onto a w × h context over `bg` (sRGB hex).
   * `tones` = 4 colours, dark → light.
   */
  step(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number, speed: number, bg: string, tones: string[], spin = 0.25) {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    const cx = w / 2
    const cy = h / 2
    const reach = Math.hypot(cx, cy)
    for (let i = 0; i < this.n; i++) {
      this.z[i] -= dt * speed * (0.35 + (i % 7) * 0.05)
      this.ang[i] += dt * spin
      if (this.z[i] <= 0.04) this.reset(i)
      const z = this.z[i]
      const r = (0.06 / z) * reach
      if (r > reach * 1.2) {
        this.reset(i)
        continue
      }
      const x = Math.round(cx + Math.cos(this.ang[i]) * r)
      const y = Math.round(cy + Math.sin(this.ang[i]) * r * 0.85)
      const size = Math.max(1, Math.round(1.3 / (z * 2.6)))
      ctx.globalAlpha = Math.min(1, (1 - z) * 1.4)
      ctx.fillStyle = tones[this.tone[i]]
      ctx.fillRect(x - (size >> 1), y - (size >> 1), size, size)
    }
    ctx.globalAlpha = 1
  }
}

/** Four tones of a colour, dark → light (sRGB hex in, CSS colours out). */
export function tonesOf(hex: string) {
  const c = hexToRgb(hex)
  return [mixRgb(c, [0, 0, 0], 0.55), c, mixRgb(c, [255, 255, 255], 0.4), mixRgb(c, [255, 255, 255], 0.8)].map((t) => css(t))
}

/** The colour mixed towards black by k (sRGB hex in, CSS colour out). */
export function darken(hex: string, k: number) {
  return css(mixRgb(hexToRgb(hex), [0, 0, 0], k))
}
