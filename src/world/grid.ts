/**
 * Dense voxel grid. Cell (x, y, z) is the block spanning
 *   x ∈ [x − ½, x + ½],  y ∈ [y, y + 1],  z ∈ [z − ½, z + ½]
 * so the hall's centre line is x = 0 and the floor surface is y = 0.
 * Anything outside the bounds reads as solid, so the mesher never emits faces facing the void.
 */
export class VoxelGrid {
  readonly data: Uint8Array
  readonly sx: number
  readonly sy: number
  readonly sz: number

  constructor(
    readonly min: [number, number, number],
    readonly max: [number, number, number],
    readonly outside = 1,
  ) {
    this.sx = max[0] - min[0] + 1
    this.sy = max[1] - min[1] + 1
    this.sz = max[2] - min[2] + 1
    this.data = new Uint8Array(this.sx * this.sy * this.sz)
  }

  private index(x: number, y: number, z: number) {
    const i = x - this.min[0]
    const j = y - this.min[1]
    const k = z - this.min[2]
    if (i < 0 || j < 0 || k < 0 || i >= this.sx || j >= this.sy || k >= this.sz) return -1
    return (k * this.sy + j) * this.sx + i
  }

  get(x: number, y: number, z: number) {
    const i = this.index(x, y, z)
    return i < 0 ? this.outside : this.data[i]
  }

  set(x: number, y: number, z: number, v: number) {
    const i = this.index(x, y, z)
    if (i >= 0) this.data[i] = v
  }

  /** Fill an inclusive box (corners in any order). */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v: number | ((x: number, y: number, z: number) => number)) {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0]
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0]
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0]
    for (let z = az; z <= bz; z++)
      for (let y = ay; y <= by; y++)
        for (let x = ax; x <= bx; x++) this.set(x, y, z, typeof v === 'number' ? v : v(x, y, z))
  }

  /** Solid test at a world-space point (for collision later). */
  solidAt(px: number, py: number, pz: number) {
    return this.get(Math.round(px), Math.floor(py), Math.round(pz)) !== 0
  }
}
