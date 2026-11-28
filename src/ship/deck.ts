/**
 * Stage 1's temporary deck: a plain hull box at the main deck's height with a plank top and low
 * bulwarks, plus the collision world for it and the deck portal. Replaced by the voxel ship in
 * stage 2 (same coordinates, so the portal, the spawn and the island stay where they are).
 */
import { BoxGeometry, BufferAttribute, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Collider, CollisionWorld, Trigger } from '../player/collision'
import { DECK, PORTAL, type V3 } from './constants'

/** Texture repeat (m per texture) on the faces normal to y, x and z: [along u, along v]. */
interface UVScale {
  y: [number, number]
  x: [number, number]
  z: [number, number]
}

/** A box from min to max with UVs in world metres (so neighbouring boxes' planks line up). */
function box(min: V3, max: V3, s: UVScale): BufferGeometry {
  const g = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  const pos = g.getAttribute('position')
  const nor = g.getAttribute('normal')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ax = Math.abs(nor.getX(i))
    const ay = Math.abs(nor.getY(i))
    let u: number
    let v: number
    if (ay > 0.5) {
      u = x / s.y[0]
      v = z / s.y[1]
    } else if (ax > 0.5) {
      u = z / s.x[0]
      v = y / s.x[1]
    } else {
      u = x / s.z[0]
      v = y / s.z[1]
    }
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2))
  return g
}

const DECK_UV: UVScale = { y: [1, 4], x: [4, 1], z: [1, 1] }
const HULL_UV: UVScale = { y: [2, 1], x: [2, 1], z: [2, 1] }
const RAIL_UV: UVScale = { y: [1, 1], x: [1, 1], z: [1, 1] }

export interface DeckGeometry {
  deck: BufferGeometry
  hull: BufferGeometry
  rail: BufferGeometry
}

export function buildDeckGeometry(): DeckGeometry {
  const { y, halfW: w, z0, z1, bottom, railH, railT } = DECK
  const top = y + railH
  const deck = box([-w, y - 0.2, z0], [w, y, z1], DECK_UV)
  const hullParts = [
    box([-w, bottom, z0], [w, y - 0.2, z1], HULL_UV),
    // bulwarks: port, starboard, bow, stern
    box([-w, y, z0], [-w + railT, top, z1], HULL_UV),
    box([w - railT, y, z0], [w, top, z1], HULL_UV),
    box([-w + railT, y, z0], [w - railT, top, z0 + railT], HULL_UV),
    box([-w + railT, y, z1 - railT], [w - railT, top, z1], HULL_UV),
  ]
  const c = 0.06
  const railParts = [
    box([-w - c, top, z0 - c], [-w + railT + c, top + 0.12, z1 + c], RAIL_UV),
    box([w - railT - c, top, z0 - c], [w + c, top + 0.12, z1 + c], RAIL_UV),
    box([-w + railT + c, top, z0 - c], [w - railT - c, top + 0.12, z0 + railT + c], RAIL_UV),
    box([-w + railT + c, top, z1 - railT - c], [w - railT - c, top + 0.12, z1 + c], RAIL_UV),
  ]
  const hull = mergeGeometries(hullParts)!
  const rail = mergeGeometries(railParts)!
  hullParts.concat(railParts).forEach((g) => g.dispose())
  return { deck, hull, rail }
}

/** The opening's trigger box: inset 5 cm from both faces, so standing flush on the sill never counts. */
export const PORTAL_OPENING = {
  min: [-PORTAL.width / 2, PORTAL.y0 + 1, PORTAL.z - 0.45] as V3,
  max: [PORTAL.width / 2, PORTAL.y0 + 1 + PORTAL.height, PORTAL.z + 0.45] as V3,
}

/**
 * Collision for the temporary deck: the hull box (wood), bulwarks up to 1.6 m (you can't jump
 * overboard), and the portal frame (its sill is a 1-block step, so only a jump gets you into
 * the opening, as in the hall). `onPortal` runs while the player is inside the opening.
 */
export function buildShipCollision(onPortal: () => void, portalOpen: () => boolean): CollisionWorld {
  const { y, halfW: w, z0, z1, bottom, railT, railCollide } = DECK
  const top = y + railCollide
  const colliders: Collider[] = [
    { min: [-w, bottom, z0], max: [w, y, z1], surface: 'wood' },
    { min: [-w - 0.2, y, z0 - 0.2], max: [-w + railT, top, z1 + 0.2], surface: 'wood' },
    { min: [w - railT, y, z0 - 0.2], max: [w + 0.2, top, z1 + 0.2], surface: 'wood' },
    { min: [-w, y, z0 - 0.2], max: [w, top, z0 + railT], surface: 'wood' },
    { min: [-w, y, z1 - railT], max: [w, top, z1 + 0.2], surface: 'wood' },
  ]
  // the frame: sill, posts and lintel (cells x −2..2, y 9..14 at z = 11)
  const fz0 = PORTAL.z - 0.5
  const fz1 = PORTAL.z + 0.5
  const fx = PORTAL.halfW + 0.5
  const ox = PORTAL.width / 2
  const y0 = PORTAL.y0
  const y1 = PORTAL.y1 + 1
  colliders.push(
    { min: [-fx, y0, fz0], max: [fx, y0 + 1, fz1], surface: 'stone' },
    { min: [-fx, y0 + 1, fz0], max: [-ox, y1 - 1, fz1], surface: 'stone' },
    { min: [ox, y0 + 1, fz0], max: [fx, y1 - 1, fz1], surface: 'stone' },
    { min: [-fx, y1 - 1, fz0], max: [fx, y1, fz1], surface: 'stone' },
    // the opening itself is solid while the portal is closed (it never is, for now)
    { min: PORTAL_OPENING.min, max: PORTAL_OPENING.max, active: () => !portalOpen() },
  )
  const triggers: Trigger[] = [{ min: PORTAL_OPENING.min, max: PORTAL_OPENING.max, active: portalOpen, inside: onPortal }]
  return { colliders, triggers, gridSurface: 'wood' }
}
