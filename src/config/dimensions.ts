/**
 * The dimension behind each portal. For now each one is a themed placeholder screen (phase 6
 * builds the real worlds). A portal without an entry gets a generic placeholder in its colour.
 */
import { PORTAL_COLORS } from './portals'
import { hall } from '../world/layout'

export interface DimensionDef {
  /** Shown above the name, e.g. "DIMENSION I". */
  numeral: string
  name: string
  blurb: string
  /** Placeholder backdrop: 'sea' = sunset ocean with a bobbing ship; 'void' = the portal's own swirl. */
  scene: 'sea' | 'void'
}

export const DIMENSIONS: Partial<Record<number, DimensionDef>> = {
  0: {
    numeral: 'DIMENSION I',
    name: 'PIRATES IN THE CARIBBEAN',
    blurb: 'Uncharted waters beyond the first blue portal.',
    scene: 'sea',
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
