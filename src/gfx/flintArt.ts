/**
 * The flint and steel, as original hand-drawn 16 × 16 pixel art, recoloured per flint:
 *  • a dark flint shard (upper left), glossy, with a pale chipped edge;
 *  • a D-shaped steel striker (lower right) whose open corner faces the flint, its lower-left arms
 *    wrapped in softly glowing cord of the flint's colour, with bright finials at both tips.
 * The same sprite becomes the 3D model (one voxel per pixel) and the hotbar icon, so they match.
 */
import { Color } from 'three'
import { SLOT, VoxelSet, type Slot } from './voxel'

export const FLINT_PX = 16

type Px = 'F' | 'f' | 'w' | 'S' | 's' | 'h' | 'C' | 'c' | 'L' | null

/**
 * Keys: F/f/w flint (edge, body, chipped highlight) · S/s/h steel (shadow, body, highlight) ·
 * C/c cord wrap (dark, mid) · L glowing finial. Rows top first.
 */
const ROWS = [
  '................',
  '.FFF............',
  'FwwwF...........',
  'FwwffF..........',
  'FwfffF..........',
  '.FfffF..........',
  '..FFfF...LhhhS..',
  '....F....LssshS.',
  '.............hS.',
  '.............sS.',
  '.....LL......sS.',
  '.....LL......sS.',
  '.....cC......sS.',
  '.....CcCcCcCcsS.',
  '......cCcCcCSSS.',
  '................',
]
const SPRITE: Px[][] = ROWS.map((r) => [...r].map((ch) => (ch === '.' ? null : (ch as Px))))

export interface FlintPalette {
  rgb: Record<Exclude<Px, null>, string>
  slot: Record<Exclude<Px, null>, Slot>
}

const hex = (c: Color) => `#${c.getHexString()}`

/** Palette for a flint of colour `color` (sRGB hex), for the 3D model or the flat icon. */
export function flintPalette(color: string, icon = false): FlintPalette {
  const base = new Color(color)
  // In 3D, cord and finials use the unlit glow material (×2.1, so bloom picks them up): keep the
  // cord dim enough to read as coloured cloth, the finials hot. The icon shows the true colours.
  const dark = hex(base.clone().multiplyScalar(icon ? 0.6 : 0.32))
  const mid = hex(base.clone().multiplyScalar(icon ? 1 : 0.55))
  const light = hex(base.clone().lerp(new Color('#ffffff'), 0.35))
  return {
    rgb: { F: '#34363e', f: '#555965', w: '#aab0bc', S: '#6f7682', s: '#c3cad4', h: '#eef2f7', C: dark, c: mid, L: light },
    // steel is matte here (a 1-px item has nothing to reflect; diffuse grey catches the torchlight)
    slot: { F: SLOT.gem, f: SLOT.gem, w: SLOT.gem, S: SLOT.matte, s: SLOT.matte, h: SLOT.matte, C: SLOT.glow, c: SLOT.glow, L: SLOT.glow },
  }
}

/** Voxel model: x right, y up, one pixel deep (z = 0), centred on the sprite. */
export function flintVoxels(color: string) {
  const pal = flintPalette(color)
  const v = new VoxelSet()
  SPRITE.forEach((row, r) =>
    row.forEach((k, x) => {
      if (!k) return
      // drawn area is x 0..14, rows 1..14: centre it on the origin
      v.set(x - 7, 7 - r, 0, pal.rgb[k], pal.slot[k])
    }),
  )
  return v
}

const icons = new Map<string, string>()
/** Hotbar icon (PNG data URL, 16 × 16; scale it with image-rendering: pixelated). */
export function flintIcon(color: string) {
  let url = icons.get(color)
  if (url) return url
  const pal = flintPalette(color, true)
  const c = document.createElement('canvas')
  c.width = c.height = FLINT_PX
  const ctx = c.getContext('2d')!
  SPRITE.forEach((row, y) =>
    row.forEach((k, x) => {
      if (!k) return
      ctx.fillStyle = pal.rgb[k]
      ctx.fillRect(x, y, 1, 1)
    }),
  )
  url = c.toDataURL()
  icons.set(color, url)
  return url
}
