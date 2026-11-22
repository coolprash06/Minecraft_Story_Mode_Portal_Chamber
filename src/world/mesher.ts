/**
 * Voxel mesher: one merged BufferGeometry per z-chunk.
 *  • Only faces next to air are emitted (the hall's ~46k cells become ~20k quads).
 *  • Per-vertex ambient occlusion from the three neighbours around each corner, baked into the
 *    vertex colour together with the block tint and a small per-block brightness jitter.
 *  • Quads are split along the brighter diagonal so AO gradients don't streak.
 */
import { BufferAttribute, BufferGeometry } from 'three'
import { hash3 } from '../lib/random'
import { tileUV } from '../gfx/atlas'
import { BLOCKS, faceTile } from './blocks'
import type { VoxelGrid } from './grid'

type V3 = [number, number, number]

interface FaceDef {
  axis: number
  sign: number
  n: V3
  /** Tangents: corners are n/2 ± u/2 ± v/2, ordered (−,−) (+,−) (+,+) (−,+), CCW from outside. */
  u: V3
  v: V3
}

const FACES: FaceDef[] = [
  { axis: 0, sign: 1, n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { axis: 0, sign: -1, n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { axis: 1, sign: 1, n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { axis: 1, sign: -1, n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { axis: 2, sign: 1, n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { axis: 2, sign: -1, n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
]

const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

/** Brightness per AO level (0 = fully enclosed corner, 3 = open). */
const AO_CURVE = [0.42, 0.62, 0.82, 1]

export interface ChunkMesh {
  geometry: BufferGeometry
  z0: number
  z1: number
}

/**
 * Optional per-face emission tag (written to the `aEmit` vertex attribute, constant per face).
 * 0 = none. The block material decodes it (see Corridor: portal frame glow).
 */
export type EmitFn = (x: number, y: number, z: number, axis: number, sign: number) => number

export function meshGrid(grid: VoxelGrid, chunkDepth = 16, emit?: EmitFn): ChunkMesh[] {
  const out: ChunkMesh[] = []
  const zMax = grid.min[2] + grid.sz - 1
  for (let z1 = zMax; z1 >= grid.min[2]; z1 -= chunkDepth) {
    const z0 = Math.max(grid.min[2], z1 - chunkDepth + 1)
    const g = meshRange(grid, z0, z1, emit)
    if (g) out.push({ geometry: g, z0, z1 })
  }
  return out
}

function meshRange(grid: VoxelGrid, z0: number, z1: number, emit?: EmitFn): BufferGeometry | null {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const em: number[] = []
  const idx: number[] = []
  const solid = (x: number, y: number, z: number) => (grid.get(x, y, z) !== 0 ? 1 : 0)

  const [x0, y0] = [grid.min[0], grid.min[1]]
  const [x1, y1] = [x0 + grid.sx - 1, y0 + grid.sy - 1]

  for (let z = z0; z <= z1; z++)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const id = grid.get(x, y, z)
        if (!id) continue
        const def = BLOCKS[id]
        if (!def) continue
        const jitter = 1 - def.jitter * hash3(x, y, z, 3)
        for (const f of FACES) {
          const nx = x + f.n[0]
          const ny = y + f.n[1]
          const nz = z + f.n[2]
          if (solid(nx, ny, nz)) continue
          const { u0, u1, vTop, vBottom } = tileUV(faceTile(def, f.axis, f.sign))
          const base = pos.length / 3
          const ao: number[] = []
          const e = emit ? emit(x, y, z, f.axis, f.sign) : 0
          em.push(e, e, e, e)
          for (const [cu, cv] of CORNERS) {
            // corner position: cell centre (x, y + ½, z) + n/2 + cu·u/2 + cv·v/2
            pos.push(
              x + (f.n[0] + cu * f.u[0] + cv * f.v[0]) * 0.5,
              y + 0.5 + (f.n[1] + cu * f.u[1] + cv * f.v[1]) * 0.5,
              z + (f.n[2] + cu * f.u[2] + cv * f.v[2]) * 0.5,
            )
            nor.push(f.n[0], f.n[1], f.n[2])
            uv.push(cu < 0 ? u0 : u1, cv < 0 ? vBottom : vTop)
            // AO: the two edge neighbours and the diagonal one, in the layer in front of the face
            const s1 = solid(nx + cu * f.u[0], ny + cu * f.u[1], nz + cu * f.u[2])
            const s2 = solid(nx + cv * f.v[0], ny + cv * f.v[1], nz + cv * f.v[2])
            const c = solid(nx + cu * f.u[0] + cv * f.v[0], ny + cu * f.u[1] + cv * f.v[1], nz + cu * f.u[2] + cv * f.v[2])
            const level = s1 && s2 ? 0 : 3 - (s1 + s2 + c)
            ao.push(level)
            const b = AO_CURVE[level] * jitter
            col.push(def.tint[0] * b, def.tint[1] * b, def.tint[2] * b)
          }
          if (ao[0] + ao[2] >= ao[1] + ao[3]) idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
          else idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base)
        }
      }

  if (!idx.length) return null
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.setAttribute('aEmit', new BufferAttribute(new Float32Array(em), 1))
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1))
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}
