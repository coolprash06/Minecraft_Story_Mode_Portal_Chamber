/**
 * Voxel modelling: props are built from coloured "pixels" (1 px = 1/16 block × a per-model scale),
 * meshed with hidden-face culling. Each voxel's colour is its texel, so models read as pixel art
 * without any texture. Voxels carry a material slot (matte, metal, glow, gem): one geometry,
 * one group per slot, drawn with the shared slot materials.
 */
import { BufferAttribute, BufferGeometry, Color, Matrix4, Vector3 } from 'three'

export const SLOT = { matte: 0, metal: 1, glow: 2, gem: 3 } as const
export type Slot = (typeof SLOT)[keyof typeof SLOT]
export const SLOT_COUNT = 4

type RGB = [number, number, number]
export type Col = string | RGB

const linCache = new Map<string, RGB>()
/** sRGB hex / 0-255 triple → linear RGB. */
export function toLinear(c: Col): RGB {
  const key = typeof c === 'string' ? c : c.join(',')
  let v = linCache.get(key)
  if (!v) {
    const col = typeof c === 'string' ? new Color(c) : new Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, 'srgb')
    v = [col.r, col.g, col.b]
    linCache.set(key, v)
  }
  return v
}

const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512)

interface Voxel {
  x: number
  y: number
  z: number
  c: RGB
  slot: Slot
}

/** Per-slot vertex data, in model space (metres). */
export interface MeshParts {
  pos: number[][]
  nor: number[][]
  col: number[][]
}

const DIRS: { n: [number, number, number]; u: [number, number, number]; v: [number, number, number] }[] = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
]
/** Unlit glow voxels get fixed per-face shading so their pixels still read as cubes. */
const GLOW_SHADE = [0.86, 0.86, 1, 0.7, 0.93, 0.93]

export class VoxelSet {
  private map = new Map<number, Voxel>()

  set(x: number, y: number, z: number, c: Col | null, slot: Slot = SLOT.matte) {
    if (c === null) {
      this.map.delete(key(x, y, z))
      return this
    }
    this.map.set(key(x, y, z), { x, y, z, c: toLinear(c), slot })
    return this
  }

  has(x: number, y: number, z: number) {
    return this.map.has(key(x, y, z))
  }

  /** Fill [x0,x1) × [y0,y1) × [z0,z1) with a colour or a per-voxel colour function (null = skip). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Col | ((x: number, y: number, z: number) => Col | null), slot: Slot = SLOT.matte) {
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const col = typeof c === 'function' ? c(x, y, z) : c
          if (col !== null) this.set(x, y, z, col, slot)
        }
    return this
  }

  /** Copy another set in, offset by (dx, dy, dz). */
  merge(other: VoxelSet, dx = 0, dy = 0, dz = 0) {
    for (const v of other.map.values()) this.map.set(key(v.x + dx, v.y + dy, v.z + dz), { ...v, x: v.x + dx, y: v.y + dy, z: v.z + dz })
    return this
  }

  get size() {
    return this.map.size
  }

  /**
   * Mesh to model space: (voxel − origin) × scale.
   * merge: coplanar visible faces with the same colour and slot are joined into rectangles (greedy).
   * Every face is flat-coloured with one normal and lit per pixel, so the result renders the same
   * pixels with far fewer, larger triangles (cheaper vertices, less small-triangle overshading).
   */
  mesh(scale: number, origin: [number, number, number] = [0, 0, 0], merge = false): MeshParts {
    if (merge) return this.meshMerged(scale, origin)
    const parts: MeshParts = { pos: [], nor: [], col: [] }
    for (let s = 0; s < SLOT_COUNT; s++) {
      parts.pos.push([])
      parts.nor.push([])
      parts.col.push([])
    }
    for (const vx of this.map.values()) {
      for (let d = 0; d < 6; d++) {
        const { n, u, v } = DIRS[d]
        if (this.map.has(key(vx.x + n[0], vx.y + n[1], vx.z + n[2]))) continue
        const P = parts.pos[vx.slot]
        const N = parts.nor[vx.slot]
        const C = parts.col[vx.slot]
        const cx = vx.x + 0.5
        const cy = vx.y + 0.5
        const cz = vx.z + 0.5
        const shade = vx.slot === SLOT.glow ? GLOW_SHADE[d] : 1
        const corners: [number, number][] = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, -1],
          [1, 1],
          [-1, 1],
        ]
        for (const [a, b] of corners) {
          P.push(
            (cx + (n[0] + a * u[0] + b * v[0]) * 0.5 - origin[0]) * scale,
            (cy + (n[1] + a * u[1] + b * v[1]) * 0.5 - origin[1]) * scale,
            (cz + (n[2] + a * u[2] + b * v[2]) * 0.5 - origin[2]) * scale,
          )
          N.push(n[0], n[1], n[2])
          C.push(vx.c[0] * shade, vx.c[1] * shade, vx.c[2] * shade)
        }
      }
    }
    return parts
  }

  private meshMerged(scale: number, origin: [number, number, number]): MeshParts {
    const parts: MeshParts = { pos: [], nor: [], col: [] }
    for (let s = 0; s < SLOT_COUNT; s++) {
      parts.pos.push([])
      parts.nor.push([])
      parts.col.push([])
    }
    // 1. visible faces, grouped by direction + plane + colour (cached array, so identity) + slot
    const colourIds = new Map<RGB, number>()
    const groups = new Map<string, { d: number; slot: Slot; c: RGB; cells: Map<string, Voxel> }>()
    for (const vx of this.map.values()) {
      let cid = colourIds.get(vx.c)
      if (cid === undefined) colourIds.set(vx.c, (cid = colourIds.size))
      for (let d = 0; d < 6; d++) {
        const { n, u, v } = DIRS[d]
        if (this.map.has(key(vx.x + n[0], vx.y + n[1], vx.z + n[2]))) continue
        const plane = vx.x * n[0] + vx.y * n[1] + vx.z * n[2]
        const gk = `${d}|${plane}|${cid}|${vx.slot}`
        let g = groups.get(gk)
        if (!g) groups.set(gk, (g = { d, slot: vx.slot, c: vx.c, cells: new Map() }))
        g.cells.set(`${vx.x * u[0] + vx.y * u[1] + vx.z * u[2]},${vx.x * v[0] + vx.y * v[1] + vx.z * v[2]}`, vx)
      }
    }
    // 2. greedy rectangles per group (deterministic: cells in insertion order)
    for (const g of groups.values()) {
      const { n, u, v } = DIRS[g.d]
      const shade = g.slot === SLOT.glow ? GLOW_SHADE[g.d] : 1
      const P = parts.pos[g.slot]
      const N = parts.nor[g.slot]
      const C = parts.col[g.slot]
      const left = new Set(g.cells.keys())
      // start each rectangle at the lowest (v, u) cell left, so it grows only in +u / +v
      const cells = [...g.cells.keys()].map((k) => k.split(',').map(Number) as [number, number])
      cells.sort((a, b) => a[1] - b[1] || a[0] - b[0])
      for (const [u0, v0] of cells) {
        if (!left.has(`${u0},${v0}`)) continue
        let w = 1
        while (left.has(`${u0 + w},${v0}`)) w++
        let h = 1
        grow: for (;;) {
          for (let k = 0; k < w; k++) if (!left.has(`${u0 + k},${v0 + h}`)) break grow
          h++
        }
        for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) left.delete(`${u0 + k},${v0 + j}`)
        const p0 = g.cells.get(`${u0},${v0}`)!
        const cx = p0.x + 0.5 + n[0] * 0.5
        const cy = p0.y + 0.5 + n[1] * 0.5
        const cz = p0.z + 0.5 + n[2] * 0.5
        for (const [a, b] of CORNERS) {
          const du = a < 0 ? -0.5 : w - 0.5
          const dv = b < 0 ? -0.5 : h - 0.5
          P.push(
            (cx + u[0] * du + v[0] * dv - origin[0]) * scale,
            (cy + u[1] * du + v[1] * dv - origin[1]) * scale,
            (cz + u[2] * du + v[2] * dv - origin[2]) * scale,
          )
          N.push(n[0], n[1], n[2])
          C.push(g.c[0] * shade, g.c[1] * shade, g.c[2] * shade)
        }
      }
    }
    return parts
  }
}

/** Quad corners (in ±u, ±v), as two triangles, in the same winding as the per-voxel mesher. */
const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
]

/** Build a (non-indexed) geometry with one group per non-empty slot, from mesh parts. */
export function partsToGeometry(parts: MeshParts): BufferGeometry {
  const g = new BufferGeometry()
  const total = parts.pos.reduce((a, p) => a + p.length, 0)
  const pos = new Float32Array(total)
  const nor = new Float32Array(total)
  const col = new Float32Array(total)
  let o = 0
  for (let s = 0; s < SLOT_COUNT; s++) {
    const n = parts.pos[s].length
    if (!n) continue
    pos.set(parts.pos[s], o)
    nor.set(parts.nor[s], o)
    col.set(parts.col[s], o)
    g.addGroup(o / 3, n / 3, s)
    o += n
  }
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('normal', new BufferAttribute(nor, 3))
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}

/**
 * Bakes many transformed model instances into world-space geometry, bucketed by z-chunk so
 * frustum culling (camera and shadow cameras) still works on the merged result.
 */
export class StaticBatch {
  private chunks = new Map<number, MeshParts>()
  private readonly v = new Vector3()
  private readonly nm = new Matrix4()

  constructor(private readonly chunkDepth = 16) {}

  add(parts: MeshParts, m: Matrix4) {
    const zc = Math.floor(this.v.setFromMatrixPosition(m).z / this.chunkDepth)
    let dst = this.chunks.get(zc)
    if (!dst) {
      dst = { pos: [], nor: [], col: [] }
      for (let s = 0; s < SLOT_COUNT; s++) {
        dst.pos.push([])
        dst.nor.push([])
        dst.col.push([])
      }
      this.chunks.set(zc, dst)
    }
    // normal matrix (rotation part; models use uniform scale)
    this.nm.extractRotation(m)
    const v = this.v
    for (let s = 0; s < SLOT_COUNT; s++) {
      const P = parts.pos[s]
      const N = parts.nor[s]
      for (let i = 0; i < P.length; i += 3) {
        v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(m)
        dst.pos[s].push(v.x, v.y, v.z)
        v.set(N[i], N[i + 1], N[i + 2]).applyMatrix4(this.nm)
        dst.nor[s].push(v.x, v.y, v.z)
      }
      for (const c of parts.col[s]) dst.col[s].push(c)
    }
  }

  build(): BufferGeometry[] {
    return [...this.chunks.values()].map(partsToGeometry)
  }
}
