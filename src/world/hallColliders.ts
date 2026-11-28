/**
 * The hall as a CollisionWorld for the player controller, built from the layout:
 *  • the voxel grid (walls, pillars, ledge, portal frames and sills, the finale pedestals);
 *  • a box for every static prop (armour stands, weapon racks, floor lanterns, torches, …), taken
 *    from the placed models' real bounds, never hand-typed sizes;
 *  • the carpet, side runners and mats as thin boxes the player steps up onto (surface 'carpet');
 *  • per portal: while unlit, a blocker filling the opening; while lit, a trigger there instead
 *    (the opening sits above a one-block sill, so only a jump gets the player's head into it).
 * Lit state and what entering does come in as callbacks, so this stays free of app state.
 */
import { Box3, Matrix4, Vector3 } from 'three'
import type { Collider, CollisionWorld, Trigger } from '../player/collision'
import type { MeshParts } from '../gfx/voxel'
import { propPlacements } from '../scene/Props'
import { hall } from './layout'

/** Local bounds of a model's mesh parts. */
function partsBounds(parts: MeshParts) {
  const b = new Box3()
  const v = new Vector3()
  for (const P of parts.pos) for (let i = 0; i < P.length; i += 3) b.expandByPoint(v.set(P[i], P[i + 1], P[i + 2]))
  return b
}

const toCollider = (b: Box3, surface?: string): Collider => ({ min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z], surface })

export interface HallWorldHooks {
  isLit: (portalId: number) => boolean
  /** The player's box is inside a lit portal's opening (called every frame while it is). */
  enterPortal: (portalId: number) => void
}

export function buildHallWorld(hooks: HallWorldHooks): CollisionWorld {
  const colliders: Collider[] = []
  const triggers: Trigger[] = []

  // props: transformed model bounds (cached per parts object, since models are shared)
  const local = new Map<MeshParts, Box3>()
  for (const p of propPlacements()) {
    let b = local.get(p.parts)
    if (!b) local.set(p.parts, (b = partsBounds(p.parts)))
    if (b.isEmpty()) continue
    colliders.push(toCollider(b.clone().applyMatrix4(p.m as Matrix4)))
  }

  // floor coverings
  const c = hall.decor.carpet
  colliders.push({ min: [-c.halfWidth, 0, c.zEnd], max: [c.halfWidth, 0.05, c.zStart], surface: 'carpet' })
  for (const r of hall.decor.runners) {
    colliders.push({ min: [Math.min(r.xFrom, r.xTo), 0, r.z - r.halfWidth], max: [Math.max(r.xFrom, r.xTo), 0.04, r.z + r.halfWidth], surface: 'carpet' })
  }
  for (const m of hall.decor.mats) {
    const [x, , z] = m.position
    colliders.push({ min: [x - m.depth / 2, 0, z - m.width / 2], max: [x + m.depth / 2, 0.03, z + m.width / 2], surface: 'carpet' })
  }

  // portal openings: blocked while dark, a trigger while lit
  for (const p of hall.portals) {
    const s = p.side
    const xFace = p.center[0] - s * 0.5 // the opening's front plane (|x| = 6.5)
    const xBack = p.center[0] + s * 0.5
    const z0 = p.center[2] - p.width / 2
    const z1 = p.center[2] + p.width / 2
    const y0 = p.center[1] - p.height / 2
    const y1 = p.center[1] + p.height / 2
    const lo = Math.min(xFace, xBack)
    const hi = Math.max(xFace, xBack)
    colliders.push({ min: [lo, y0, z0], max: [hi, y1, z1], active: () => !hooks.isLit(p.id) })
    // inset 5 cm from the front plane: standing flush against the sill never counts
    const tlo = s < 0 ? lo : lo + 0.05
    const thi = s < 0 ? hi - 0.05 : hi
    triggers.push({ min: [tlo, y0, z0], max: [thi, y1, z1], active: () => hooks.isLit(p.id), inside: () => hooks.enterPortal(p.id) })
  }

  const g = hall.grid
  return {
    solid: (x, y, z) => g.get(x, y, z) !== 0,
    colliders,
    triggers,
    gridSurface: 'stone',
  }
}
