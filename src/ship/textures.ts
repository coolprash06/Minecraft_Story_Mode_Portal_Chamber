/**
 * Procedural wood for the temporary deck (16 px per block, painted once; the real ship in stage 2
 * gets an atlas of its own). Nearest magnification for crisp pixels, mipmapped + anisotropic
 * minification so the long deck doesn't shimmer.
 */
import { CanvasTexture, LinearMipmapLinearFilter, NearestFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { mulberry32 } from '../lib/random'

type RGB = [number, number, number]
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]

function texture(w: number, h: number, paint: (px: (x: number, y: number, c: RGB) => void, rnd: () => number) => void, seed: number): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const rnd = mulberry32(seed)
  paint((x, y, c) => {
    const i = (((y % h) + h) % h) * w + (((x % w) + w) % w)
    img.data[i * 4] = Math.max(0, Math.min(255, Math.round(c[0])))
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(c[1])))
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(c[2])))
    img.data[i * 4 + 3] = 255
  }, rnd)
  ctx.putImageData(img, 0, 0)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.magFilter = NearestFilter
  t.minFilter = LinearMipmapLinearFilter
  t.anisotropy = 8
  t.generateMipmaps = true
  return t
}

/**
 * Planks of `width` px running along the texture's long axis, with dark seams, staggered butt
 * joints (with two nails each) and grain streaks. `along`: 'v' = planks run along v (the deck,
 * along the ship); 'u' = along u (hull and bulwark sides).
 */
function planks(w: number, h: number, along: 'u' | 'v', palette: string[], seam: string, seed: number, width = 4) {
  return texture(
    w,
    h,
    (px, rnd) => {
      const across = along === 'v' ? w : h
      const length = along === 'v' ? h : w
      const seamC = hex(seam)
      for (let p = 0; p < across / width; p++) {
        const base = hex(palette[Math.floor(rnd() * palette.length)])
        const joint = Math.floor(rnd() * length)
        // a slow grain value per lane across the plank
        const lanes = Array.from({ length: width }, () => 0.94 + rnd() * 0.1)
        for (let a = 0; a < width; a++)
          for (let l = 0; l < length; l++) {
            const ac = p * width + a
            let c: RGB
            if (a === 0) c = seamC
            else {
              const streak = rnd() < 0.06 ? 0.88 : 1
              c = scale(base, lanes[a] * streak * (0.97 + rnd() * 0.06))
              if (l === joint) c = scale(seamC, 1.15)
              // nails just past the joint
              if (l === (joint + 1) % length && (a === 1 || a === width - 1)) c = hex('#3a2a1c')
            }
            if (along === 'v') px(ac, l, c)
            else px(l, ac, c)
          }
      }
    },
    seed,
  )
}

export interface DeckTextures {
  /** Deck planks: 1 m across (u, 16 px) × 4 m along the ship (v, 64 px). */
  deck: Texture
  /** Hull / bulwark planks running along the ship: 2 m (u, 32 px) × 1 m (v, 16 px). */
  hull: Texture
  /** Dark rail cap: 1 m × 1 m. */
  rail: Texture
}

export function deckTextures(): DeckTextures {
  return {
    deck: planks(16, 64, 'v', ['#c19a63', '#b48c57', '#caa66f', '#a98250', '#bd955c'], '#80603e', 11),
    hull: planks(32, 16, 'u', ['#8a5d37', '#7d5430', '#966840', '#74502e'], '#4a3018', 12),
    rail: planks(16, 16, 'u', ['#674327', '#5c3b22', '#70492b'], '#3a2412', 13, 8),
  }
}
