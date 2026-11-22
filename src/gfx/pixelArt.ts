/**
 * Original pixel art: royal crests, banner cloth, the carpet runner and item sprites (weapons),
 * plus `extrude`, which turns a sprite into a 1-pixel-thick voxel model.
 */
import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three'
import { hash3 } from '../lib/random'
import { SLOT, VoxelSet, type Col, type Slot } from './voxel'

/* ───────────────────────────── crests (7 × 8, original) ───────────────────────────── */

export const CRESTS: string[][] = [
  // crown
  ['#..#..#', '##.#.##', '#######', '#.#.#.#', '#######', '.......', '#######', '.......'],
  // tower
  ['#.#.#.#', '#######', '.#####.', '.##.##.', '.##.##.', '.#####.', '.##.##.', '#######'],
  // sun
  ['...#...', '.#.#.#.', '..###..', '###.###', '..###..', '.#.#.#.', '...#...', '.......'],
  // star
  ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##', '.......'],
  // lily
  ['...#...', '..###..', '#.###.#', '##.#.##', '.#####.', '...#...', '..###..', '.......'],
  // crossed keys
  ['##...##', '##...##', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
]

/** Field / charge colours per crest. */
export const CREST_COLORS: { field: string; charge: string; trim: string }[] = [
  { field: '#8e1b22', charge: '#f2c14e', trim: '#f2c14e' },
  { field: '#1d2f7a', charge: '#f2c14e', trim: '#d9dde6' },
  { field: '#4b1f6e', charge: '#f2c14e', trim: '#f2c14e' },
  { field: '#145c3a', charge: '#f0e6c8', trim: '#f2c14e' },
  { field: '#16161c', charge: '#d93a3a', trim: '#f2c14e' },
  { field: '#d8cfb6', charge: '#8e1b22', trim: '#8e1b22' },
]

const crestAt = (crest: number, x: number, y: number) => {
  const g = CRESTS[crest % CRESTS.length]
  return y >= 0 && y < g.length && x >= 0 && x < 7 && g[y][x] === '#'
}

function hexRGB(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function texture(c: HTMLCanvasElement, repeat = false) {
  const t = new CanvasTexture(c)
  t.magFilter = NearestFilter
  t.minFilter = NearestFilter
  t.generateMipmaps = false
  t.colorSpace = SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping
  return t
}

function paint(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number] | null) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = fn(x, y)
      if (!v) continue
      const i = (y * w + x) * 4
      img.data[i] = v[0]
      img.data[i + 1] = v[1]
      img.data[i + 2] = v[2]
      img.data[i + 3] = v[3]
    }
  ctx.putImageData(img, 0, 0)
  return c
}

const vary = (c: [number, number, number], f: number): [number, number, number, number] => [c[0] * f, c[1] * f, c[2] * f, 255]

/* ───────────────────────────── banner cloth ───────────────────────────── */

export const BANNER_PX = { w: 24, h: 56 }

/** Banner: bordered field, crest charge scaled ×2, chevrons, swallowtail cut at the bottom. */
export function bannerTexture(crest: number) {
  const { w, h } = BANNER_PX
  const pal = CREST_COLORS[crest % CREST_COLORS.length]
  const field = hexRGB(pal.field)
  const charge = hexRGB(pal.charge)
  const trim = hexRGB(pal.trim)
  const c = paint(w, h, (x, y) => {
    // swallowtail: V notch in the bottom 8 rows
    const fromBottom = h - 1 - y
    if (fromBottom < 8 && Math.abs(x - (w - 1) / 2) < 8 - fromBottom) return null
    const n = 0.9 + hash3(x, y, crest, 5) * 0.12
    // weave shading: alternate rows slightly darker
    const weave = y % 2 === 0 ? 1 : 0.94
    const edge = x === 0 || x === w - 1 || y === 0
    if (edge) return vary(trim, 0.75 * n)
    if (x === 2 || x === w - 3 || y === 2) return vary(trim, n)
    // crest, 2× scale, centred at the top third
    const cx = Math.floor((x - (w / 2 - 7)) / 2)
    const cy = Math.floor((y - 8) / 2)
    if (crestAt(crest, cx, cy)) return vary(charge, n)
    // chevrons below the crest
    const dx = Math.abs(x - (w - 1) / 2)
    const chev = (y - 30 - dx * 0.75) % 7
    if (y > 28 && y < h - 10 && chev >= 0 && chev < 2) return vary(trim, n * 0.92)
    return vary(field, n * weave)
  })
  return texture(c)
}

/* ───────────────────────────── carpet runner ───────────────────────────── */

/** 32 × 16 px tile = 2 m × 1 m: red pile with a diamond lattice, gold edging both sides. */
export function carpetTexture() {
  const red = hexRGB('#8a1620')
  const redDark = hexRGB('#5e0d15')
  const redLight = hexRGB('#a8222b')
  const gold = hexRGB('#d7a83a')
  const goldDark = hexRGB('#8f6a1c')
  const c = paint(32, 16, (x, y) => {
    const n = 0.92 + hash3(x, y, 9, 2) * 0.12
    if (x === 0 || x === 31) return vary(goldDark, n)
    if (x === 1 || x === 30) return vary(gold, n)
    if (x === 2 || x === 29) return vary(redDark, n)
    if ((x === 4 || x === 27) && y % 4 < 2) return vary(gold, n * 0.9)
    const dx = Math.abs(x - 15.5)
    const dy = Math.abs(y - 7.5)
    const d = dx * 0.9 + dy
    if (Math.abs(d - 7) < 0.6) return vary(gold, n * 0.85)
    if (d < 2.2) return vary(redLight, n)
    if (Math.abs(d - 4) < 0.5) return vary(redDark, n)
    return vary(red, n)
  })
  const t = texture(c, true)
  return t
}

/**
 * Side runner: 16 × 16 px tile = 1 m along × 1 m across (x runs along the runner, y across it).
 * The main carpet's palette and edging, with one small gold diamond per metre.
 */
export function runnerTexture() {
  const red = hexRGB('#8a1620')
  const redDark = hexRGB('#5e0d15')
  const redLight = hexRGB('#a8222b')
  const gold = hexRGB('#d7a83a')
  const goldDark = hexRGB('#8f6a1c')
  const c = paint(16, 16, (x, y) => {
    const n = 0.92 + hash3(x, y, 11, 2) * 0.12
    if (y === 0 || y === 15) return vary(goldDark, n)
    if (y === 1 || y === 14) return vary(gold, n)
    if (y === 2 || y === 13) return vary(redDark, n)
    if ((y === 4 || y === 11) && x % 4 < 2) return vary(gold, n * 0.9)
    const d = Math.abs(x - 7.5) + Math.abs(y - 7.5)
    if (Math.abs(d - 3) < 0.6) return vary(gold, n * 0.85)
    if (d < 1.6) return vary(redLight, n)
    return vary(red, n)
  })
  return texture(c, true)
}

/** Mat in front of a portal: 14 × 48 px = 0.9 m deep (x) × 3 m wide (y). */
export const MAT_PX = { w: 14, h: 48, border: 2 } as const

/**
 * The mat's red pile and gold trim. The outer 2 px ring is pale grey: the mat's shader tints it
 * with the portal's colour (desaturated while the portal is dark, glowing once it is lit).
 */
export function matTexture() {
  const { w, h, border } = MAT_PX
  const red = hexRGB('#8a1620')
  const redDark = hexRGB('#5e0d15')
  const redLight = hexRGB('#a8222b')
  const gold = hexRGB('#d7a83a')
  const pale = hexRGB('#e8e8ee')
  const c = paint(w, h, (x, y) => {
    const n = 0.92 + hash3(x, y, 13, 2) * 0.12
    const ring = Math.min(x, y, w - 1 - x, h - 1 - y)
    if (ring < border) return vary(pale, ring === 0 ? n * 0.78 : n)
    if (ring === border) return vary(redDark, n)
    if (ring === border + 1) return vary(gold, n)
    // centre: a long diamond with a light core, plus small studs along the axis
    const dx = Math.abs(x - (w - 1) / 2)
    const dy = Math.abs(y - (h - 1) / 2)
    const d = dx + dy * 0.28
    if (Math.abs(d - 3.2) < 0.55) return vary(gold, n * 0.88)
    if (d < 1.7) return vary(redLight, n)
    if (dx < 0.6 && dy > 9 && (y % 5 === 0)) return vary(gold, n * 0.8)
    return vary(red, n)
  })
  return texture(c)
}

/* ───────────────────────────── item sprites ───────────────────────────── */

type Palette = Record<string, { c: Col; slot: Slot }>

const STEEL: Palette = {
  b: { c: '#d9dee6', slot: SLOT.metal },
  B: { c: '#9aa1ad', slot: SLOT.metal },
  i: { c: '#4a4e57', slot: SLOT.metal },
  g: { c: '#e0b13e', slot: SLOT.metal },
  h: { c: '#6b4a2b', slot: SLOT.matte },
  H: { c: '#4e331c', slot: SLOT.matte },
  s: { c: '#e8e2d0', slot: SLOT.matte },
  r: { c: '#a3242c', slot: SLOT.matte },
}

const shaft = (n: number, w: number, col = 'h', alt = 'H') => Array.from({ length: n }, (_, i) => '.'.repeat((w - 1) / 2) + (i % 2 ? alt : col) + '.'.repeat((w - 1) / 2))

export const SPRITES: Record<'sword' | 'axe' | 'spear' | 'bow', string[]> = {
  sword: [
    '...b...',
    '..bBb..',
    ...Array.from({ length: 12 }, () => '..bBb..'),
    'ggggggg',
    '.g.r.g.',
    '...h...',
    '...H...',
    '...h...',
    '..ggg..',
    '...g...',
  ],
  axe: [
    '....i....',
    '.bb.i.bb.',
    'bBBbibBBb',
    'bBBbibBBb',
    'bBBbibBBb',
    '.bb.i.bb.',
    '....i....',
    ...shaft(12, 9),
    '...ggg...',
    '....i....',
  ],
  spear: ['..b..', '.bbb.', '.bBb.', 'bbBbb', '.bBb.', '.bBb.', '..b..', '.ggg.', '..r..', ...shaft(17, 5), '..i..'],
  bow: (() => {
    const rows: string[] = []
    const H = 18
    for (let y = 0; y < H; y++) {
      const t = Math.sin((Math.PI * y) / (H - 1))
      const limb = Math.round(5 - 4 * t)
      const row = Array.from({ length: 8 }, () => '.')
      row[limb] = y > 7 && y < 11 ? 'H' : 'h'
      if (y > 7 && y < 11) row[limb] = y === 9 ? 'g' : 'H'
      if (y > 0 && y < H - 1) row[6] = 's'
      if (y === 0 || y === H - 1) row[6] = 'h'
      rows.push(row.join(''))
    }
    return rows
  })(),
}

/**
 * Extrude a sprite into voxels (x right, y up, z = 0..thickness−1), centred on x, bottom at y = 0.
 * Returns the set and the sprite size in px.
 */
export function extrude(rows: string[], palette: Palette = STEEL, thickness = 1) {
  const set = new VoxelSet()
  const h = rows.length
  const w = rows[0].length
  const ox = Math.floor(w / 2)
  rows.forEach((row, r) => {
    const y = h - 1 - r
    for (let x = 0; x < row.length; x++) {
      const p = palette[row[x]]
      if (!p) continue
      for (let z = 0; z < thickness; z++) set.set(x - ox, y, z, p.c, p.slot)
    }
  })
  return { set, w, h }
}

/** Heater shield: metal rim, heraldic field, crest charge, wooden back. Centred on x, bottom y = 0. */
export function shieldVoxels(crest: number) {
  const pal = CREST_COLORS[crest % CREST_COLORS.length]
  const set = new VoxelSet()
  const W = 13
  const H = 15
  const inside = (x: number, y: number) => {
    const cx = Math.abs(x - (W - 1) / 2)
    const half = y >= 6 ? 6.5 : 6.5 - (6 - y) * 1.05
    return cx < half
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue
      const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || y === H - 1
      const X = x - 6
      set.set(X, y, -1, '#4e331c')
      if (rim) set.set(X, y, 0, '#c9a03a', SLOT.metal)
      else {
        const cx = x - 3
        const cy = H - 1 - y - 3
        const charge = crestAt(crest, cx, cy)
        const n = 0.92 + hash3(x, y, crest, 1) * 0.1
        const base = hexRGB(charge ? pal.charge : pal.field)
        set.set(X, y, 0, [base[0] * n, base[1] * n, base[2] * n], charge && pal.charge === '#f2c14e' ? SLOT.metal : SLOT.matte)
      }
    }
  // boss
  set.set(0, 8, 1, '#e0b13e', SLOT.metal)
  return { set, w: W, h: H }
}
