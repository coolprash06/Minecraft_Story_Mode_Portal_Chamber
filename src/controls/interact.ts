/**
 * Interaction targets and picking. Targets are boxes generated from the item config (one item frame
 * and one portal per enabled flint). A pick is a ray test against those boxes, then a voxel walk
 * through the hall grid so a pillar between you and a target blocks it. Glide picks under the
 * mouse; Free Roam (phase 3) will pass the screen centre instead.
 */
import { Box3, Ray, Vector3, type Camera } from 'three'
import { FLINTS } from '../config/items'
import type { Hover } from '../state/store'
import { hall, type Placement } from '../world/layout'
import { ITEM_FRAME_PX, ITEM_FRAME_SCALE } from '../scene/models'

/** Farther than this (m) nothing is interactive. */
export const REACH = 20

export interface Target {
  hover: NonNullable<Hover>
  box: Box3
  /** Wall placement and size, for the hover outline. */
  placement: Placement
  width: number
  height: number
}

/** Axis-aligned box on a wall: `out` metres into the hall, `back` metres into the wall. */
function wallBox(p: Placement, width: number, height: number, out: number, back: number, centerY: number) {
  const n = new Vector3(...p.normal)
  const t = new Vector3(0, 1, 0).cross(n) // along the wall
  const c = new Vector3(...p.position)
  const box = new Box3()
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      for (const d of [out, -back]) box.expandByPoint(c.clone().addScaledVector(t, (a * width) / 2).addScaledVector(n, d).setY(centerY + (b * height) / 2))
  return box
}

const frameSize = ITEM_FRAME_PX.size * ITEM_FRAME_SCALE

export const TARGETS: Target[] = FLINTS.flatMap((f) => {
  const portal = hall.portals[f.portalId]
  const fp = portal.holders[f.holder]
  // the portal's frame face: 5 × 6 blocks, its front face at the recess back wall
  const face: Placement = { position: [portal.center[0] + portal.normal[0] * 0.5, 3, portal.center[2]], normal: portal.normal }
  return [
    { hover: { kind: 'frame', flintId: f.id }, box: wallBox(fp, frameSize + 0.06, frameSize + 0.06, 0.16, 0.02, fp.position[1]), placement: fp, width: frameSize, height: frameSize },
    { hover: { kind: 'portal', portalId: portal.id }, box: wallBox(face, 5, 6, 0.08, 1, 3), placement: face, width: 5, height: 6 },
  ] satisfies Target[]
})

/* ───────────────────────────── voxel walk ───────────────────────────── */

/**
 * Distance along a unit ray to the first solid hall block (Amanatides–Woo). Cells span
 * x, z ∈ [c − ½, c + ½] and y ∈ [c, c + 1] (see VoxelGrid).
 */
export function voxelHit(o: Vector3, d: Vector3, max: number) {
  const g = hall.grid
  const px = o.x + 0.5
  const py = o.y
  const pz = o.z + 0.5
  let x = Math.floor(px)
  let y = Math.floor(py)
  let z = Math.floor(pz)
  const sx = Math.sign(d.x)
  const sy = Math.sign(d.y)
  const sz = Math.sign(d.z)
  const tdx = sx ? Math.abs(1 / d.x) : Infinity
  const tdy = sy ? Math.abs(1 / d.y) : Infinity
  const tdz = sz ? Math.abs(1 / d.z) : Infinity
  let tx = sx ? (sx > 0 ? x + 1 - px : px - x) * tdx : Infinity
  let ty = sy ? (sy > 0 ? y + 1 - py : py - y) * tdy : Infinity
  let tz = sz ? (sz > 0 ? z + 1 - pz : pz - z) * tdz : Infinity
  let t = 0
  while (t <= max) {
    if (g.get(x, y, z) !== 0) return t
    if (tx < ty && tx < tz) {
      x += sx
      t = tx
      tx += tdx
    } else if (ty < tz) {
      y += sy
      t = ty
      ty += tdy
    } else {
      z += sz
      t = tz
      tz += tdz
    }
  }
  return Infinity
}

const ray = new Ray()
const hitPoint = new Vector3()

/**
 * The nearest unblocked target under normalised device coords (x, y ∈ −1..1), or null.
 * `enabled(t)` filters targets (e.g. an emptied frame).
 */
export function pick(camera: Camera, ndcX: number, ndcY: number, enabled: (t: Target) => boolean): Target | null {
  ray.origin.setFromMatrixPosition(camera.matrixWorld)
  ray.direction.set(ndcX, ndcY, 0.5).unproject(camera).sub(ray.origin).normalize()
  let best: Target | null = null
  let bestD = REACH
  for (const t of TARGETS) {
    if (!enabled(t)) continue
    if (!ray.intersectBox(t.box, hitPoint)) continue
    const d = hitPoint.distanceTo(ray.origin)
    if (d < bestD) {
      best = t
      bestD = d
    }
  }
  // blocked by the hall itself? (small tolerance: targets sit on, or just in front of, a wall)
  if (best && voxelHit(ray.origin, ray.direction, bestD + 0.2) < bestD - 0.05) return null
  return best
}
