/**
 * The Founding King: an original pixel-art portrait for the end wall, painted at the hall's own
 * density (16 px per block), plus the engraved nameplate beneath it. Pure pixel maths (no DOM),
 * so it can also be previewed outside the browser.
 *
 * Composition (36 × 44 px = 2.25 × 2.75 m): a silver-bearded monarch seated on a gold throne with
 * a purple tufted back, in a deep red robe with gold-trimmed front and an ermine-style mantle and
 * hem, wearing a gold crown set with a cyan gem and holding a ruby-tipped sceptre, above a
 * stone dais with a red runner, against a navy drape with a faint gold diaper pattern.
 */

export const KING_W = 36
export const KING_H = 44

/** Stable 0..1 hash (self-contained so this module has no imports). */
function h2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const PAL: Record<string, string> = {
  // gold, light → dark
  T: '#ffe58f',
  G: '#f0c654',
  g: '#c99a30',
  u: '#8a6418',
  // throne velvet
  V: '#4a1f6a',
  v: '#2e1244',
  // robe
  Q: '#c22d36',
  R: '#9a1a25',
  r: '#640e17',
  // ermine
  W: '#f2eee6',
  w: '#c9c2b4',
  k: '#1a1414',
  // skin
  S: '#e8b894',
  s: '#c98f6c',
  z: '#a06a4e',
  q: '#d98a7a',
  // silver beard / hair
  B: '#eeece6',
  b: '#b8b5ad',
  n: '#8a877f',
  // details
  e: '#1c1a24',
  m: '#5a2a24',
  C: '#9ffaff',
  c: '#1fc8e0',
  X: '#d22a3a',
  o: '#3b2416',
  O: '#5e3d24',
  // dais stone
  P: '#8f8b82',
  p: '#5d5a54',
}

const hexRGB = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Returns RGBA pixels (row-major, y = 0 at the top) and a matching glow map: black except the
 * crown's cyan gem, so it stays cyan under the warm lamplight (warm light alone turns it green).
 */
export function paintKing(): { px: Uint8ClampedArray; glow: Uint8ClampedArray } {
  const W = KING_W
  const H = KING_H
  const g: string[][] = Array.from({ length: H }, () => Array<string>(W).fill('.'))
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c
  }
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string | ((x: number, y: number) => string)) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, typeof c === 'string' ? c : c(x, y))
  }
  /** Mirror across the vertical centre line (between columns 17 and 18). */
  const mx = (x: number) => W - 1 - x
  const sym = (x: number, y: number, c: string) => (set(x, y, c), set(mx(x), y, c))
  const symRect = (x0: number, y0: number, x1: number, y1: number, c: string) => (rect(x0, y0, x1, y1, c), rect(mx(x1), y0, mx(x0), y1, c))
  const ermine = (x: number, y: number) => ((x * 3 + y * 5) % 7 === 0 ? 'k' : 'W')

  /* ── throne back: arched gold frame around purple tufted velvet ── */
  const halfAt = (y: number) => (y < 0 ? -1 : y <= 3 ? [2, 5, 8, 10][y] : y <= 31 ? 10 : -1)
  const inBack = (x: number, y: number) => {
    const half = halfAt(y)
    return half >= 0 && x >= 18 - half && x <= 17 + half
  }
  for (let y = 0; y <= 31; y++)
    for (let x = 0; x < W; x++) {
      if (!inBack(x, y)) continue
      let ring = 3
      for (let d = 1; d <= 2 && ring === 3; d++)
        if (!inBack(x - d, y) || !inBack(x + d, y) || !inBack(x, y - d) || (y < 31 && !inBack(x, y + d))) ring = d
      if (ring === 1) set(x, y, x < 18 || y <= 3 ? 'T' : 'g')
      else if (ring === 2) set(x, y, 'u')
      else set(x, y, (x + y) % 4 === 0 && y % 2 === 0 ? 'v' : 'V')
    }
  // finials on the shoulders of the arch, a ruby at its crown
  symRect(7, 1, 9, 2, 'G')
  sym(8, 0, 'T')
  sym(7, 1, 'T')
  set(17, 1, 'X')
  set(18, 1, 'X')

  /* ── armrests, seat rail, legs ── */
  symRect(4, 26, 9, 26, 'T')
  symRect(4, 27, 9, 28, 'g')
  symRect(5, 28, 9, 28, 'u')
  sym(4, 26, 'G')
  symRect(5, 29, 6, 37, 'g')
  symRect(6, 29, 6, 37, 'u')
  rect(7, 34, 28, 34, 'T')
  rect(7, 35, 28, 35, 'g')
  symRect(7, 36, 8, 38, 'u')
  sym(7, 36, 'g')

  /* ── robe ── */
  rect(10, 21, 25, 21, 'R')
  rect(11, 22, 24, 34, 'R')
  rect(10, 30, 25, 33, 'R')
  rect(9, 33, 26, 34, 'R')
  // light from the upper left: highlight columns, shadowed right side, lap folds
  rect(11, 22, 12, 34, (x) => (x === 11 ? 'Q' : 'R'))
  rect(10, 30, 10, 34, 'Q')
  rect(23, 22, 25, 34, (x) => (x === 23 ? 'R' : 'r'))
  rect(26, 33, 26, 34, 'r')
  for (const fx of [13, 21]) rect(fx, 31, fx, 34, 'r')
  rect(14, 32, 14, 34, 'Q')
  // belt
  rect(11, 29, 24, 29, 'u')
  // front opening: gold tunic between ermine borders, with buttons
  rect(17, 23, 18, 34, 'g')
  for (const by of [25, 28, 31]) (set(17, by, 'G'), set(18, by, 'G'))
  set(17, 29, 'T')
  set(18, 29, 'T')
  rect(16, 23, 16, 34, ermine)
  rect(19, 23, 19, 34, ermine)
  // ermine hem over a gold border
  rect(9, 35, 26, 35, ermine)
  rect(9, 36, 26, 36, (x) => (x % 2 ? 'G' : 'g'))

  /* ── boots ── */
  for (const [x0, toe] of [
    [13, 12],
    [20, 23],
  ]) {
    rect(x0, 37, x0 + 2, 38, 'o')
    rect(x0, 38, x0 + 2, 38, 'O')
    set(toe, 38, 'o')
    set(x0 + 1, 37, 'G')
  }

  /* ── sleeves, sceptre and hands ── */
  rect(9, 21, 11, 24, (x) => (x === 9 ? 'Q' : 'R')) // king's right sleeve (viewer's left)
  rect(24, 21, 26, 24, (x) => (x === 24 ? 'R' : 'r')) // king's left sleeve
  // sceptre: a banded gold rod leaning out over the armrest, ruby-tipped fleur against the drape
  for (let t = -2; t <= 14; t++) set(10 - Math.floor(t / 2), 25 - t, t % 4 === 0 ? 'G' : 'g')
  set(3, 6, 'T')
  rect(2, 7, 4, 7, 'G')
  set(3, 7, 'T')
  set(1, 8, 'G')
  set(5, 8, 'G')
  set(2, 8, 'g')
  set(3, 8, 'X')
  set(4, 8, 'g')
  rect(2, 9, 4, 9, 'g')
  set(3, 10, 'u')
  set(11, 28, 'T')
  // cuffs and hands
  rect(9, 24, 11, 24, ermine)
  rect(9, 25, 11, 26, 'S')
  set(10, 25, 'g') // rod shows between the fingers
  set(11, 26, 's')
  rect(24, 24, 26, 24, ermine)
  rect(25, 25, 27, 25, 'S')
  set(27, 25, 's')

  /* ── ermine mantle over the shoulders ── */
  rect(12, 19, 23, 19, ermine)
  rect(10, 20, 25, 20, ermine)
  rect(9, 21, 26, 22, (x, y) => (y === 22 ? (ermine(x, y) === 'k' ? 'k' : 'w') : ermine(x, y)))
  // a gold chain of office across the mantle
  rect(12, 22, 23, 22, (x) => (x % 2 ? 'G' : 'g'))

  /* ── head ── */
  rect(13, 9, 22, 15, 'b') // hair behind
  rect(14, 10, 21, 16, 'S')
  rect(21, 10, 21, 16, 's')
  rect(14, 16, 21, 16, 's')
  symRect(13, 10, 13, 15, 'b')
  set(13, 10, 'B')
  rect(15, 11, 16, 11, 'n') // brows
  rect(19, 11, 20, 11, 'n')
  set(16, 12, 'e') // eyes
  set(19, 12, 'e')
  set(15, 12, 'S')
  set(20, 12, 'S')
  set(17, 13, 'S') // small, straight nose
  set(18, 13, 's')
  set(17, 14, 's')
  set(18, 14, 'z')
  set(15, 14, 'q') // cheeks
  set(20, 14, 'q')

  /* ── silver beard ── */
  rect(15, 15, 20, 15, 'B') // moustache
  set(14, 16, 'B')
  set(21, 16, 'b')
  rect(14, 16, 16, 16, 'B')
  rect(19, 16, 21, 16, 'b')
  set(17, 16, 'm')
  set(18, 16, 'm')
  const beardRows: [number, number, number][] = [
    [17, 14, 21],
    [18, 14, 21],
    [19, 14, 21],
    [20, 15, 20],
    [21, 15, 20],
    [22, 16, 19],
    [23, 16, 19],
    [24, 17, 18],
  ]
  for (const [y, x0, x1] of beardRows)
    for (let x = x0; x <= x1; x++) {
      const right = x >= 18
      const strand = (x + y) % 3 === 0
      set(x, y, strand ? (right ? 'n' : 'b') : right ? 'b' : 'B')
    }

  /* ── crown: gold band, three points, cyan centre gem, ruby side stones ── */
  rect(13, 9, 22, 9, 'g')
  rect(13, 7, 22, 8, 'G')
  set(14, 8, 'X')
  set(21, 8, 'X')
  set(17, 7, 'C')
  set(18, 7, 'c')
  set(17, 8, 'c')
  set(18, 8, 'c')
  for (const x of [13, 14, 16, 17, 18, 19, 21, 22]) set(x, 6, 'G')
  set(15, 6, 'V')
  set(20, 6, 'V')
  for (const x of [13, 22]) set(x, 5, 'T')
  set(17, 5, 'G')
  set(18, 5, 'G')
  set(17, 4, 'T')
  set(18, 4, 'T')

  /* ── dais with a red runner ── */
  rect(3, 39, 32, 39, 'P')
  rect(3, 40, 32, 40, 'p')
  rect(3, 41, 32, 41, 'g')
  rect(0, 42, 35, 42, 'P')
  rect(0, 43, 35, 43, 'p')
  rect(14, 39, 21, 43, (x, y) => (x === 14 || x === 21 ? 'G' : y === 39 || y === 42 ? 'Q' : 'R'))

  /* ── colour ── */
  const out = new Uint8ClampedArray(W * H * 4)
  const glow = new Uint8ClampedArray(W * H * 4)
  const bg = hexRGB('#1b2140')
  const diaper = hexRGB('#4a3d1c')
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ch = g[y][x]
      let c: [number, number, number]
      let f = 0.95 + h2(x, y, 7) * 0.09
      if (ch === '.') {
        // navy drape: vertical folds, darker towards the edges, faint gold lozenges
        const fold = 0.78 + 0.22 * Math.sin(x * 0.9 + 0.6)
        const edge = 1 - 0.35 * Math.pow(Math.abs(x - 17.5) / 17.5, 2)
        c = (x + 2 * y) % 8 === 3 && y % 4 === 1 ? diaper : bg
        f *= fold * edge
      } else {
        c = hexRGB(PAL[ch] ?? '#ff00ff')
        if (ch === 'e' || ch === 'C' || ch === 'c') f = 1
      }
      const i = (y * W + x) * 4
      out[i] = c[0] * f
      out[i + 1] = c[1] * f
      out[i + 2] = c[2] * f
      out[i + 3] = 255
      const gem = ch === 'C' || ch === 'c'
      glow[i] = gem ? c[0] * 0.55 : 0
      glow[i + 1] = gem ? c[1] * 0.55 : 0
      glow[i + 2] = gem ? c[2] * 0.55 : 0
      glow[i + 3] = 255
    }
  return { px: out, glow }
}

/* ───────────────────────────── nameplate ───────────────────────────── */

/** 5 × 7 pixel font: only the glyphs the plaque needs (original letterforms). */
const GLYPHS: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}

export const PLAQUE_W = 120
export const PLAQUE_H = 20

/** Dark lacquered plate, double gold border, raised gold letters with a 1 px drop shadow. */
export function paintPlaque(text = 'THE FOUNDING KING'): Uint8ClampedArray {
  const W = PLAQUE_W
  const H = PLAQUE_H
  const out = new Uint8ClampedArray(W * H * 4)
  const put = (x: number, y: number, c: [number, number, number]) => {
    const i = (y * W + x) * 4
    out[i] = c[0]
    out[i + 1] = c[1]
    out[i + 2] = c[2]
    out[i + 3] = 255
  }
  const field = hexRGB('#1d1416')
  const goldHi = hexRGB('#ffe58f')
  const gold = hexRGB('#e0b13e')
  const goldLo = hexRGB('#8a6418')
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y)
      const f = 0.92 + h2(x, y, 3) * 0.1
      let c = field
      if (edge === 0) c = x === 0 || y === 0 ? gold : goldLo
      else if (edge === 1) c = goldLo
      else if (edge === 3) c = gold
      put(x, y, [c[0] * f, c[1] * f, c[2] * f])
    }
  // corner studs
  for (const [x, y] of [
    [5, 5],
    [W - 6, 5],
    [5, H - 6],
    [W - 6, H - 6],
  ])
    put(x, y, goldHi)
  const adv = 6
  const width = text.length * adv - 1
  const ox = Math.floor((W - width) / 2)
  const oy = Math.floor((H - 7) / 2)
  // two passes, so a letter's drop shadow never covers the stroke of its neighbour
  for (const pass of ['shadow', 'gold'] as const)
    [...text].forEach((ch, k) => {
      const glyph = GLYPHS[ch] ?? GLYPHS[' ']
      for (let gy = 0; gy < 7; gy++)
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy][gx] !== '#') continue
          const x = ox + k * adv + gx
          const y = oy + gy
          if (pass === 'shadow') put(x + 1, y + 1, [8, 5, 5])
          else put(x, y, gy === 0 ? goldHi : gold)
        }
    })
  return out
}
