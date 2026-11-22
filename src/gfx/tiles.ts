/**
 * 16×16 pixel-art block tiles, painted procedurally. All original: hand-tuned palettes plus seeded
 * per-pixel noise, no external textures. Greyscale tiles ('frame', 'band') are tinted per block.
 */
import { mulberry32 } from '../lib/random'

export const TILE_SIZE = 16

export const TILE_NAMES = [
  'brick',
  'brickCracked',
  'brickDark',
  'pillar',
  'pillarCap',
  'floorA',
  'floorB',
  'floorC',
  'ceiling',
  'beamSide',
  'beamEnd',
  'trim',
  'frame',
  'band',
] as const

export type TileName = (typeof TILE_NAMES)[number]
export const TILE = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i])) as Record<TileName, number>

type RGB = [number, number, number]
/** A painted colour, optionally flagged as gold (metallic, polished). */
type Px = RGB | [number, number, number, 'gold']
/** RGBA, row-major, 16×16. */
export type TilePixels = Uint8ClampedArray
/**
 * Colour + material maps for one tile. `mr` is RGBA laid out like three's ORM convention:
 * G = roughness, B = metalness, so one texture feeds both roughnessMap and metalnessMap.
 * R = glow mask, read only on faces tagged as emissive (the portal frames).
 */
export interface Tile {
  px: TilePixels
  mr: TilePixels
}

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f]


function canvas16(fn: (x: number, y: number, rnd: () => number) => Px, seed: number, roughness = 0.9, glowFromLuma = false): Tile {
  const px = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
  const mr = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4)
  const rnd = mulberry32(seed)
  for (let y = 0; y < TILE_SIZE; y++)
    for (let x = 0; x < TILE_SIZE; x++) {
      const c = fn(x, y, rnd)
      const i = (y * TILE_SIZE + x) * 4
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = 255
      const gold = c[3] === 'gold'
      // glow mask: squared brightness, so bevels and glints glow and the facets stay dim
      mr[i] = glowFromLuma ? Math.round(Math.pow(c[0] / 255, 2) * 255) : 255
      mr[i + 1] = Math.round((gold ? 0.32 : roughness) * 255)
      mr[i + 2] = gold ? 255 : 0
      mr[i + 3] = 255
    }
  return { px, mr }
}

/** Polished gold inlay, light → dark by `level`. */
const GOLD_PAL = ['#7a5410', '#a8771c', '#d4a12e', '#f0c654', '#ffe58f']
const gold = (level: number, rnd: () => number): Px => {
  const c = pal(GOLD_PAL, level, rnd, 0.2)
  return [c[0], c[1], c[2], 'gold']
}

/** Pick from a small palette (dark → light) with a noisy index around `level` (0..1). */
function pal(colors: string[], level: number, rnd: () => number, spread = 0.35) {
  const t = Math.max(0, Math.min(0.999, level + (rnd() - 0.5) * spread))
  return hex(colors[Math.floor(t * colors.length)])
}

/* ─────────────── stone brick: 4 courses of 4 px, staggered, dark mortar ─────────────── */

const BRICK_PAL = ['#23252f', '#2c2f3a', '#343846', '#3c404e', '#464b5a']
const BRICK_DARK_PAL = ['#1a1b22', '#20222b', '#272a34', '#2e313c', '#363a46']

function brick(palette: string[], seed: number, cracked: boolean) {
  const mortar = hex('#14151b')
  const crack = new Set<number>()
  if (cracked) {
    const r = mulberry32(seed * 31)
    let x = 3 + Math.floor(r() * 10)
    for (let y = 1; y < 15; y++) {
      crack.add(y * 16 + x)
      if (r() < 0.45) x += r() < 0.5 ? -1 : 1
      x = Math.max(1, Math.min(14, x))
    }
  }
  return canvas16((x, y, rnd) => {
    const row = y >> 2
    const offset = row % 2 === 0 ? 0 : 4
    const bx = (x + offset) % 8
    if (y % 4 === 3 || bx === 7) return mortar
    if (crack.has(y * 16 + x)) return shade(mortar, 0.8)
    // brick body: lighter top-left edge, darker bottom-right
    let level = 0.45
    if (y % 4 === 0) level += 0.2
    if (bx === 0) level += 0.12
    if (y % 4 === 2) level -= 0.12
    const brickId = (row * 2 + Math.floor((x + offset) / 8)) % 4
    level += (brickId - 1.5) * 0.05
    return pal(palette, level, rnd)
  }, seed)
}

/* ─────────────── pale pillar stone: smooth, faint vertical veins, bevelled edges ─────────────── */

const PILLAR_PAL = ['#8e8a80', '#a29e93', '#b3afa3', '#c1bdb1', '#cfcbbf']

const pillar = () =>
  canvas16((x, y, rnd) => {
    if (x === 0 || x === 15) return pal(PILLAR_PAL, 0.12, rnd, 0.1)
    if (x === 1) return pal(PILLAR_PAL, 0.75, rnd, 0.15)
    if (x === 14) return pal(PILLAR_PAL, 0.3, rnd, 0.15)
    const vein = (x === 6 && y % 5 !== 0) || (x === 10 && (y + 2) % 7 < 3) ? -0.18 : 0
    return pal(PILLAR_PAL, 0.55 + vein, rnd, 0.22)
  }, 101, 0.7)

/** Capital / base block: pale stone framed in gold with a gold lozenge. */
const pillarCap = () =>
  canvas16((x, y, rnd) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15
    const band = y === 1 || y === 14
    const inner = x === 2 || y === 2 || x === 13 || y === 13
    const d = Math.abs(x - 7.5) + Math.abs(y - 7.5)
    if (edge) return pal(PILLAR_PAL, 0.1, rnd, 0.08)
    if (band) return gold(y === 1 ? 0.75 : 0.35, rnd)
    if (d < 2) return gold(0.85, rnd)
    if (d < 3.2) return gold(0.45, rnd)
    if (inner) return pal(PILLAR_PAL, 0.28, rnd, 0.1)
    return pal(PILLAR_PAL, 0.58, rnd, 0.2)
  }, 102, 0.6)

/* ─────────────── floor tiles: polished dark slabs with a 1 px bevel ─────────────── */

function floorTile(palette: string[], seed: number) {
  return canvas16((x, y, rnd) => {
    if (x === 0 || y === 0) return pal(palette, 0.85, rnd, 0.1)
    if (x === 15 || y === 15) return pal(palette, 0.05, rnd, 0.05)
    // soft diagonal sheen + speckle
    const sheen = ((x + y) % 11 === 0 ? 0.12 : 0) - (x * 0.006 + y * 0.006)
    return pal(palette, 0.5 + sheen, rnd, 0.3)
  }, seed, 0.5)
}

/* ─────────────── ceiling planks / beams: very dark stained wood ─────────────── */

const WOOD_PAL = ['#140e0a', '#1c140e', '#251a12', '#2e2117', '#38291c']

const ceiling = () =>
  canvas16((x, y, rnd) => {
    if (y % 4 === 3) return hex('#0d0907')
    const plank = y >> 2
    const seam = (x + plank * 5) % 16 === 0
    if (seam) return hex('#100b08')
    const grain = Math.sin((x + plank * 7) * 0.9 + y * 2.1) * 0.12
    return pal(WOOD_PAL, 0.5 + grain + (plank % 2) * 0.08, rnd, 0.25)
  }, 201, 0.85)

const beamSide = () =>
  canvas16((x, y, rnd) => {
    if (y === 0 || y === 15) return pal(WOOD_PAL, 0.1, rnd, 0.05)
    const grain = Math.sin(y * 1.7 + Math.sin(x * 0.4) * 1.5) * 0.18
    return pal(WOOD_PAL, 0.55 + grain, rnd, 0.22)
  }, 202)

const beamEnd = () =>
  canvas16((x, y, rnd) => {
    const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
    if (r > 7) return pal(WOOD_PAL, 0.1, rnd, 0.05)
    const ring = Math.floor(Math.hypot(x - 7.5, y - 7.5)) % 2
    return pal(['#2a1f15', '#33261a', '#3d2e20', '#46362a'], 0.4 + ring * 0.25, rnd, 0.2)
  }, 203, 0.85)

/* ─────────────── trim: pale slab with a groove ─────────────── */

const trim = () =>
  canvas16((x, y, rnd) => {
    if (y === 0) return pal(PILLAR_PAL, 0.85, rnd, 0.1)
    if (y === 15) return pal(PILLAR_PAL, 0.08, rnd, 0.05)
    // gold moulding along the ledge
    if (y === 7 || y === 8) return gold(y === 7 ? 0.7 : 0.35, rnd)
    return pal(PILLAR_PAL, x === 0 ? 0.3 : 0.5, rnd, 0.2)
  }, 301, 0.6)

/* ─────────────── greyscale tintables ─────────────── */

const GREY = ['#3a3a3a', '#5a5a5a', '#7c7c7c', '#a0a0a0', '#c8c8c8', '#ececec']

/** Portal frame: faceted gem block with bright glints. */
const frame = () =>
  canvas16((x, y, rnd) => {
    if (x === 0 || y === 0) return pal(GREY, 0.7, rnd, 0.1)
    if (x === 15 || y === 15) return pal(GREY, 0.08, rnd, 0.05)
    const facet = ((x >> 2) + (y >> 2)) % 2 === 0 ? 0.08 : -0.08
    const glint = rnd() < 0.05 ? 0.4 : 0
    return pal(GREY, 0.45 + facet + glint, rnd, 0.25)
  }, 401, 0.3, true)

/** Lintel band: felted, soft cloth-like block. */
const band = () =>
  canvas16((x, y, rnd) => {
    const weave = (x + y) % 3 === 0 ? -0.1 : (x * 3 + y) % 5 === 0 ? 0.08 : 0
    return pal(GREY, 0.62 + weave, rnd, 0.22)
  }, 402, 0.95)

/** Paint every tile, indexed by TILE. */
export function paintTiles(): Tile[] {
  const byName: Record<TileName, () => Tile> = {
    brick: () => brick(BRICK_PAL, 11, false),
    brickCracked: () => brick(BRICK_PAL, 12, true),
    brickDark: () => brick(BRICK_DARK_PAL, 13, false),
    pillar,
    pillarCap,
    floorA: () => floorTile(['#1d1f27', '#252731', '#2d2f3b', '#363845', '#424452'], 21),
    floorB: () => floorTile(['#383b48', '#424554', '#4c5060', '#575b6c', '#666a7c'], 22),
    floorC: () => floorTile(['#121217', '#17171e', '#1d1d25', '#24242d', '#2c2c37'], 23),
    ceiling,
    beamSide,
    beamEnd,
    trim,
    frame,
    band,
  }
  return TILE_NAMES.map((n) => byName[n]())
}
