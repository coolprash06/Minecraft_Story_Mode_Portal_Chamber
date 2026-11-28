/**
 * The dimension behind each portal. A dimension with a `world` is a real 3D world (its own lazy
 * chunk, loaded behind the warp screen); the rest are themed placeholder screens (phase 6 builds
 * the others). A portal without an entry gets a generic placeholder in its colour.
 */
import { COARSE_POINTER } from '../lib/device'
import { PORTAL_COLORS } from './portals'
import { hall } from '../world/layout'

/** The 3D worlds (each one a lazy chunk; see state/world.ts). */
export type WorldId = 'ship'

export interface DimensionDef {
  /** Shown above the name, e.g. "DIMENSION I". */
  numeral: string
  name: string
  blurb: string
  /** Placeholder backdrop: 'sea' = sunset ocean with a bobbing ship; 'void' = the portal's own swirl. */
  scene: 'sea' | 'void'
  /** A real 3D world behind this portal (Free Roam only: touch devices keep the placeholder). */
  world?: WorldId
}

export const DIMENSIONS: Partial<Record<number, DimensionDef>> = {
  0: {
    numeral: 'DIMENSION I',
    name: 'PIRATES IN THE CARIBBEAN',
    blurb: 'Uncharted waters beyond the first blue portal.',
    scene: 'sea',
    world: 'ship',
  },
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII']

export function dimensionFor(portalId: number): DimensionDef & { color: string } {
  const p = hall.portals[portalId]
  const color = PORTAL_COLORS[p?.color ?? 'blue']
  const def = DIMENSIONS[portalId] ?? {
    numeral: `DIMENSION ${ROMAN[portalId] ?? portalId + 1}`,
    name: 'AN UNCHARTED REALM',
    blurb: 'Nothing has been mapped beyond this portal yet.',
    scene: 'void' as const,
  }
  return { ...def, color }
}

/** The 3D world behind a portal, or null (a placeholder screen). Touch devices: always null (no Free Roam). */
export function worldFor(portalId: number): WorldId | null {
  if (COARSE_POINTER) return null
  return DIMENSIONS[portalId]?.world ?? null
}
