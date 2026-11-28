/**
 * Swept-box collision against a voxel grid plus extra boxes (reusable: the hall, Mission 1's ship).
 *
 * Grid convention (as VoxelGrid): cell (x, y, z) spans x ∈ [x − ½, x + ½], y ∈ [y, y + 1],
 * z ∈ [z − ½, z + ½]. A world supplies `solid(x, y, z)` for cells, plus axis-aligned boxes (props,
 * thin floor coverings, dynamic blockers) and trigger volumes.
 *
 * Movement resolves one axis at a time (Y, then X, then Z), each clamped so the moving box stops
 * flush against the first solid it would enter. Boxes the player already overlaps are ignored, so a
 * blocker that appears around the player never traps them. Callers sub-step large moves.
 */

export type Vec3 = [number, number, number]

export interface Box {
  min: Vec3
  max: Vec3
}

export interface Collider extends Box {
  /** Floor surface for footsteps ('carpet', 'wood', …). Unset: the default surface. */
  surface?: string
  /** Dynamic colliders: solid only while this returns true. */
  active?: () => boolean
}

export interface Trigger extends Box {
  /** Called every frame while the player's box overlaps this one. */
  inside: () => void
  active?: () => boolean
}

export interface CollisionWorld {
  /** Solid voxel cell? Out-of-range cells should read as solid. */
  solid?: (x: number, y: number, z: number) => boolean
  colliders: Collider[]
  triggers?: Trigger[]
  /** Surface name for grid cells (footsteps). */
  gridSurface?: string
}

const EPS = 1e-4

const overlaps = (a: Box, b: Box, skip = -1) => {
  for (let i = 0; i < 3; i++) {
    if (i === skip) continue
    if (a.max[i] <= b.min[i] + EPS || a.min[i] >= b.max[i] - EPS) return false
  }
  return true
}

const cell: Collider = { min: [0, 0, 0], max: [0, 0, 0] }

/**
 * Move `box` along `axis` by `d` (mutates it). Returns the distance actually moved and the collider
 * that stopped it (a cell is reported as null with blocked = true).
 */
export function sweepAxis(world: CollisionWorld, box: Box, axis: 0 | 1 | 2, d: number, near: Collider[]): { moved: number; blocked: boolean; hit: Collider | null } {
  if (d === 0) return { moved: 0, blocked: false, hit: null }
  let allowed = d
  let hit: Collider | null = null
  let blocked = false
  // the region swept this step
  const lo = box.min[axis] + Math.min(0, d)
  const hi = box.max[axis] + Math.max(0, d)
  const consider = (c: Box, ref: Collider | null) => {
    if (!overlaps(box, c, axis)) return
    // already inside it: never block (lets the player walk out of a blocker that appeared)
    if (c.max[axis] > box.min[axis] + EPS && c.min[axis] < box.max[axis] - EPS) return
    if (d > 0 && c.min[axis] >= box.max[axis] - EPS && c.min[axis] < hi) {
      const a = c.min[axis] - box.max[axis]
      if (a < allowed) {
        allowed = Math.max(0, a)
        hit = ref
        blocked = true
      }
    } else if (d < 0 && c.max[axis] <= box.min[axis] + EPS && c.max[axis] > lo) {
      const a = c.max[axis] - box.min[axis]
      if (a > allowed) {
        allowed = Math.min(0, a)
        hit = ref
        blocked = true
      }
    }
  }

  if (world.solid) {
    const rmin = [box.min[0], box.min[1], box.min[2]]
    const rmax = [box.max[0], box.max[1], box.max[2]]
    rmin[axis] = lo
    rmax[axis] = hi
    const x0 = Math.floor(rmin[0] + 0.5 + EPS)
    const x1 = Math.floor(rmax[0] + 0.5 - EPS)
    const y0 = Math.floor(rmin[1] + EPS)
    const y1 = Math.floor(rmax[1] - EPS)
    const z0 = Math.floor(rmin[2] + 0.5 + EPS)
    const z1 = Math.floor(rmax[2] + 0.5 - EPS)
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          if (!world.solid(x, y, z)) continue
          cell.min[0] = x - 0.5
          cell.max[0] = x + 0.5
          cell.min[1] = y
          cell.max[1] = y + 1
          cell.min[2] = z - 0.5
          cell.max[2] = z + 0.5
          consider(cell, null)
        }
  }
  for (const c of near) consider(c, c)

  box.min[axis] += allowed
  box.max[axis] += allowed
  return { moved: allowed, blocked, hit }
}

/** Colliders whose box comes within `margin` of `box` (a cheap per-frame broadphase). */
export function nearColliders(world: CollisionWorld, box: Box, margin: number, out: Collider[]) {
  out.length = 0
  for (const c of world.colliders) {
    if (c.active && !c.active()) continue
    if (c.max[0] < box.min[0] - margin || c.min[0] > box.max[0] + margin) continue
    if (c.max[1] < box.min[1] - margin || c.min[1] > box.max[1] + margin) continue
    if (c.max[2] < box.min[2] - margin || c.min[2] > box.max[2] + margin) continue
    out.push(c)
  }
  return out
}

/** Run `inside` for every active trigger the box overlaps. */
export function runTriggers(world: CollisionWorld, box: Box) {
  for (const t of world.triggers ?? []) {
    if (t.active && !t.active()) continue
    if (overlaps(box, t)) t.inside()
  }
}
