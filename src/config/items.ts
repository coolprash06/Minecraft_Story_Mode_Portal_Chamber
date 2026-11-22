/**
 * Portal keys: one unique flint and steel per portal. A portal is interactive (hover, light,
 * fizzle) exactly when a FLINTS entry names it, and that entry's item frame is placed beside it.
 * To enable another portal, add an entry here, e.g.
 *   { id: 'crimson', name: 'Crimson Flint', color: PORTAL_COLORS.red, portalId: 2, holder: 'itemFrame' },
 * Portal ids: bay by bay from the entrance, left (−x) then right (+x): 0 = bay 0 left, 1 = bay 0
 * right, 2 = bay 1 left, … (see world/layout.ts and PORTAL_ORDER).
 */
import { PORTAL_COLORS } from './portals'

export interface FlintDef {
  id: string
  name: string
  /** Handle, accents, glow, sparkles and tooltip colour (sRGB hex). */
  color: string
  /** The one portal this flint lights. */
  portalId: number
  /** Where it waits in the hall. Only item frames for now (the layout also has a chest spot). */
  holder: 'itemFrame'
}

export const FLINTS: FlintDef[] = [
  { id: 'azure', name: 'Azure Flint', color: PORTAL_COLORS.blue, portalId: 0, holder: 'itemFrame' },
]

/**
 * Dev-only flints: never placed in the hall, only given by ?give=<id> (to test the "doesn't match"
 * path while only one real flint exists). Their portal stays disabled.
 */
export const DEV_FLINTS: FlintDef[] = [
  { id: 'crimson', name: 'Crimson Flint', color: PORTAL_COLORS.red, portalId: 2, holder: 'itemFrame' },
]

const ALL = new Map([...FLINTS, ...DEV_FLINTS].map((f) => [f.id, f]))
export const flintById = (id: string | null | undefined) => (id ? ALL.get(id) : undefined)
/** Portals that have a flint in the hall (and so can be hovered / lit). */
export const flintForPortal = new Map(FLINTS.map((f) => [f.portalId, f]))

/** Hotbar size. */
export const HOTBAR_SLOTS = 9
