import { COLOR_KEYS, PORTAL_COLORS, type PortalColor } from '../config/portals'
import { TILE, type TileName } from '../gfx/tiles'

/**
 * Block registry. Every block in the grid is a full opaque cube (non-cube props such as torches,
 * chests and lanterns are separate meshes). Tinted blocks share one greyscale tile and get their
 * colour from the vertex colour, so 9 portal colours cost no extra texture space.
 */
export interface BlockDef {
  name: string
  top: TileName
  bottom: TileName
  side: TileName
  /** Optional end tile for the ±x faces (beams running along x). */
  endX?: TileName
  /** Optional end tile for the ±z faces (beams running along z). */
  endZ?: TileName
  /** Linear-space tint multiplier (r, g, b). */
  tint: [number, number, number]
  /** Per-block random brightness jitter amplitude (0 = uniform). */
  jitter: number
}

export const AIR = 0
export const B = {
  BRICK: 1,
  BRICK_CRACKED: 2,
  BRICK_DARK: 3,
  PILLAR: 4,
  PILLAR_CAP: 5,
  FLOOR_A: 6,
  FLOOR_B: 7,
  FLOOR_C: 8,
  CEILING: 9,
  BEAM_X: 10,
  BEAM_Z: 11,
  TRIM: 12,
} as const

/** Frame block for portal colour i: FRAME_BASE + i. Lintel band: BAND_BASE + i. */
export const FRAME_BASE = 32
export const BAND_BASE = 48

const WHITE: [number, number, number] = [1, 1, 1]

/** sRGB hex → linear rgb, scaled. */
function lin(hex: string, scale = 1): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => {
    const s = c / 255
    return (s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)) * scale
  }
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)]
}

const same = (t: TileName, tint = WHITE, jitter = 0.07): BlockDef => ({ name: t, top: t, bottom: t, side: t, tint, jitter })

export const BLOCKS: (BlockDef | undefined)[] = []
BLOCKS[B.BRICK] = same('brick')
BLOCKS[B.BRICK_CRACKED] = same('brickCracked')
BLOCKS[B.BRICK_DARK] = same('brickDark')
BLOCKS[B.PILLAR] = { ...same('pillar', WHITE, 0.03), top: 'pillarCap', bottom: 'pillarCap' }
BLOCKS[B.PILLAR_CAP] = same('pillarCap', WHITE, 0.03)
BLOCKS[B.FLOOR_A] = same('floorA', WHITE, 0.05)
BLOCKS[B.FLOOR_B] = same('floorB', WHITE, 0.05)
BLOCKS[B.FLOOR_C] = same('floorC', WHITE, 0.05)
BLOCKS[B.CEILING] = same('ceiling', WHITE, 0.06)
BLOCKS[B.BEAM_X] = { ...same('beamSide', WHITE, 0.04), endX: 'beamEnd' }
BLOCKS[B.BEAM_Z] = { ...same('beamSide', WHITE, 0.04), endZ: 'beamEnd' }
BLOCKS[B.TRIM] = same('trim', WHITE, 0.03)

COLOR_KEYS.forEach((key, i) => {
  // Frames: gem-like portal colour, desaturated towards stone grey so the stone still reflects the
  // orange torchlight (a pure blue frame reflects ~nothing of it and vanishes). Their colour is
  // carried by the glow (Corridor). Bands: brighter, flatter.
  const frameTint = lin(PORTAL_COLORS[key]).map((c) => (c * 0.6 + 0.4 * 0.35) * 0.95) as [number, number, number]
  BLOCKS[FRAME_BASE + i] = { ...same('frame', frameTint, 0.05), name: `frame-${key}` }
  BLOCKS[BAND_BASE + i] = { ...same('band', lin(PORTAL_COLORS[key], 0.9), 0.04), name: `band-${key}` }
})

export const frameBlock = (c: PortalColor) => FRAME_BASE + COLOR_KEYS.indexOf(c)
export const bandBlock = (c: PortalColor) => BAND_BASE + COLOR_KEYS.indexOf(c)

/** Tile index for a block face. axis: 0 = x, 1 = y, 2 = z; sign ±1. */
export function faceTile(def: BlockDef, axis: number, sign: number): number {
  if (axis === 1) return TILE[sign > 0 ? def.top : def.bottom]
  if (axis === 0 && def.endX) return TILE[def.endX]
  if (axis === 2 && def.endZ) return TILE[def.endZ]
  return TILE[def.side]
}
