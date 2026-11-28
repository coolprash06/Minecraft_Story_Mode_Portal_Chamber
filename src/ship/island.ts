/**
 * The island off the starboard quarter (where the ruined exit portal will stand, later): 1 m voxels,
 * deterministic. A noisy coastline about 44 m across its middle, with a sandy cove facing the ship
 * (the beach you'll land on), a grassy plateau rising to two hills (the higher one at the back,
 * about 22 m), rock on the steep and high parts, palms along the beach, and a few rocks offshore.
 *
 * Also builds the coast distance map (metres to the nearest land, 1 m texels over ±64 m) that
 * the sea uses for its turquoise shallows and the surf along the shore.
 */
import { DataTexture, LinearFilter, RedFormat, UnsignedByteType, type BufferGeometry } from 'three'
import { partsToGeometry, VoxelSet, type Col } from '../gfx/voxel'
import { hash3, mulberry32 } from '../lib/random'
import { ISLAND } from './constants'

const N = ISLAND.half
const SIZE = N * 2

const smooth = (t: number) => t * t * (3 - 2 * t)
const sstep = (a: number, b: number, x: number) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))))

function vnoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fz = smooth(z - iz)
  const a = hash3(ix, 0, iz, seed)
  const b = hash3(ix + 1, 0, iz, seed)
  const c = hash3(ix, 0, iz + 1, seed)
  const d = hash3(ix + 1, 0, iz + 1, seed)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}
const fbm = (x: number, z: number, seed: number) => vnoise(x, z, seed) * 0.55 + vnoise(x * 2.1, z * 2.1, seed + 1) * 0.3 + vnoise(x * 4.3, z * 4.3, seed + 2) * 0.15

/** Smallest signed difference between two angles. */
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

type Top = 'sand' | 'grass' | 'rock'

interface Terrain {
  /** Top voxel height per column (−1 = water), index (x + N) + (z + N) · SIZE. */
  h: Int16Array
  top: Top[]
  /** Normalised distance from the centre to the coast (≥ 1 = sea). */
  d: Float32Array
}

const idx = (x: number, z: number) => x + N + (z + N) * SIZE

function terrain(): Terrain {
  const h = new Int16Array(SIZE * SIZE).fill(-1)
  const top: Top[] = new Array(SIZE * SIZE).fill('sand')
  const d = new Float32Array(SIZE * SIZE).fill(9)
  // the ship lies this way from the island's centre: the cove opens towards it
  const toShip = Math.atan2(-ISLAND.z, -ISLAND.x)
  const peaks = [
    { x: 9, z: 13, h: 21, r: 13 },
    { x: -17, z: 5, h: 11, r: 10 },
  ]
  for (let z = -N; z < N; z++)
    for (let x = -N; x < N; x++) {
      const a = Math.atan2(z, x)
      // a coastline that wobbles with the angle (noise sampled round a circle, so it's seamless)
      let R = 44 * (0.8 + 0.4 * fbm(Math.cos(a) * 1.7 + 11, Math.sin(a) * 1.7 + 11, 3))
      // the cove: the coast pulls in towards the ship, leaving a wide beach
      R -= 9 * Math.exp(-((angDiff(a, toShip) / 0.42) ** 2))
      const r = Math.hypot(x, z) + (fbm(x * 0.15, z * 0.15, 5) - 0.5) * 3
      const dn = r / R
      d[idx(x, z)] = dn
      if (dn >= 1) continue
      const cove = Math.exp(-((angDiff(a, toShip) / 0.5) ** 2))
      // beach (0–1 m), then a plateau and the hills
      const inland = sstep(0.82 - cove * 0.12, 0.55 - cove * 0.1, dn)
      let height = inland * (2 + 2 * fbm(x * 0.07, z * 0.07, 7))
      for (const p of peaks) height += p.h * Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (2 * p.r * p.r)) * inland
      height += (fbm(x * 0.11, z * 0.11, 9) - 0.5) * 2.4 * inland
      const hh = Math.max(0, Math.round(height))
      h[idx(x, z)] = dn > 0.93 ? 0 : hh
    }
  // offshore rocks (a few small stacks), outside the coast
  const rnd = mulberry32(41)
  for (let k = 0; k < 5; k++) {
    const a = rnd() * Math.PI * 2
    const r = 50 + rnd() * 9
    const cx = Math.round(Math.cos(a) * r)
    const cz = Math.round(Math.sin(a) * r)
    const size = 1 + Math.floor(rnd() * 2)
    for (let dz = -size; dz <= size; dz++)
      for (let dx = -size; dx <= size; dx++) {
        const x = cx + dx
        const z = cz + dz
        if (x < -N || x >= N || z < -N || z >= N || Math.hypot(dx, dz) > size + 0.3) continue
        const i = idx(x, z)
        h[i] = Math.max(h[i], Math.round((size + 1.5 - Math.hypot(dx, dz)) * (0.8 + rnd() * 0.5)))
        top[i] = 'rock'
      }
  }
  // surface types: steep or high = rock, low near the coast = sand, else grass
  for (let z = -N; z < N; z++)
    for (let x = -N; x < N; x++) {
      const i = idx(x, z)
      if (h[i] < 0 || top[i] === 'rock') continue
      let steep = 0
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const nz = z + dz
        const hn = nx < -N || nx >= N || nz < -N || nz >= N ? -1 : h[idx(nx, nz)]
        steep = Math.max(steep, h[i] - hn)
      }
      if (h[i] >= 17 || (steep >= 3 && h[i] > 4)) top[i] = 'rock'
      else if (h[i] <= 1 && d[i] > 0.6) top[i] = 'sand'
      else top[i] = 'grass'
    }
  return { h, top, d }
}

const PAL = {
  sand: ['#ecdcab', '#e5d39e', '#f1e3b9', '#e9d8a4'],
  wetSand: ['#d3be8d', '#cbb583'],
  grass: ['#5cba3e', '#50ad35', '#68c649', '#4aa231'],
  dirt: ['#8b5e3b', '#7c5333', '#94663f'],
  rock: ['#8f9297', '#7f8287', '#a2a5aa', '#888b90'],
  trunk: ['#9b6b3d', '#87592f'],
  leaf: ['#3e9b2d', '#4fb339', '#348a26'],
  nut: '#6a4a25',
}
const pick = (list: string[], x: number, y: number, z: number, seed: number) => list[Math.floor(hash3(x, y, z, seed) * list.length)]

function colourAt(t: Terrain, x: number, y: number, z: number): Col {
  const i = idx(x, z)
  const top = t.top[i]
  const ht = t.h[i]
  if (top === 'rock') return pick(PAL.rock, x, y, z, 1)
  if (top === 'sand') return y <= 0 && t.d[i] > 0.88 ? pick(PAL.wetSand, x, y, z, 2) : pick(PAL.sand, x, y, z, 3)
  if (y === ht) return pick(PAL.grass, x, y, z, 4)
  if (y >= ht - 2) return pick(PAL.dirt, x, y, z, 5)
  return pick(PAL.rock, x, y, z, 6)
}

/** A palm: a leaning, ringed trunk, a crown of drooping fronds and a few coconuts. */
function palm(v: VoxelSet, x: number, y: number, z: number, rnd: () => number) {
  const height = 7 + Math.floor(rnd() * 4)
  const lean = rnd() * Math.PI * 2
  const amount = 1.5 + rnd() * 2
  let tx = x
  let tz = z
  for (let k = 1; k <= height; k++) {
    const f = (k / height) ** 2 * amount
    tx = x + Math.round(Math.cos(lean) * f)
    tz = z + Math.round(Math.sin(lean) * f)
    v.set(tx, y + k, tz, PAL.trunk[k % 2])
  }
  const cy = y + height + 1
  v.set(tx, cy, tz, PAL.leaf[2])
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
  ]
  const start = Math.floor(rnd() * 2)
  for (let di = start; di < dirs.length; di += 1) {
    if (di >= 4 && rnd() < 0.35) continue
    const [dx, dz] = dirs[di]
    const len = di < 4 ? 4 + Math.floor(rnd() * 2) : 3
    for (let s = 1; s <= len; s++) {
      const droop = s <= 1 ? 0 : Math.floor(((s - 1) * (s - 1)) / 3)
      v.set(tx + dx * s, cy - droop, tz + dz * s, PAL.leaf[(s + di) % 3])
    }
  }
  // coconuts under the crown
  for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0]].slice(0, 1 + Math.floor(rnd() * 3))) v.set(tx + dx, cy - 1, tz + dz, PAL.nut)
}

export interface IslandAssets {
  geometry: BufferGeometry
  /** Distance to the nearest land, ×4 per byte (0..63.75 m), 1 m texels over ±64 m. */
  coast: DataTexture
}

export function buildIsland(): IslandAssets {
  const t = terrain()
  const v = new VoxelSet()
  for (let z = -N; z < N; z++)
    for (let x = -N; x < N; x++) {
      const ht = t.h[idx(x, z)]
      if (ht < 0) continue
      // fill down to the lowest neighbouring top, so every exposed side face exists (and one
      // voxel under the water line, so the swell never shows a gap)
      let low = ht
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const nz = z + dz
        const hn = nx < -N || nx >= N || nz < -N || nz >= N ? -1 : t.h[idx(nx, nz)]
        low = Math.min(low, hn + 1)
      }
      for (let y = Math.max(-1, low - 1); y <= ht; y++) v.set(x, y, z, colourAt(t, x, y, z))
    }
  // palms along the beach and the edge of the grass (at least 6 m apart)
  const rnd = mulberry32(77)
  const spots: [number, number][] = []
  for (let tries = 0; tries < 900 && spots.length < 16; tries++) {
    const x = Math.floor(rnd() * SIZE) - N
    const z = Math.floor(rnd() * SIZE) - N
    const i = idx(x, z)
    const dn = t.d[i]
    if (t.h[i] < 0 || dn < 0.5 || dn > 0.86 || t.top[i] === 'rock' || t.h[i] > 5) continue
    if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 6)) continue
    spots.push([x, z])
    palm(v, x, t.h[i], z, rnd)
  }
  const geometry = partsToGeometry(v.mesh(1, [0, 0, 0], true))
  return { geometry, coast: coastMap(t) }
}

/** Chamfer distance transform (3-4 weights) from the land columns. */
function coastMap(t: Terrain): DataTexture {
  const INF = 1e9
  const dist = new Float32Array(SIZE * SIZE)
  for (let i = 0; i < dist.length; i++) dist[i] = t.h[i] >= 0 ? 0 : INF
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= SIZE || z >= SIZE ? INF : dist[x + z * SIZE])
  for (let z = 0; z < SIZE; z++)
    for (let x = 0; x < SIZE; x++) {
      const i = x + z * SIZE
      dist[i] = Math.min(dist[i], at(x - 1, z) + 3, at(x, z - 1) + 3, at(x - 1, z - 1) + 4, at(x + 1, z - 1) + 4)
    }
  for (let z = SIZE - 1; z >= 0; z--)
    for (let x = SIZE - 1; x >= 0; x--) {
      const i = x + z * SIZE
      dist[i] = Math.min(dist[i], at(x + 1, z) + 3, at(x, z + 1) + 3, at(x + 1, z + 1) + 4, at(x - 1, z + 1) + 4)
    }
  const data = new Uint8Array(SIZE * SIZE)
  for (let i = 0; i < data.length; i++) data[i] = Math.min(255, Math.round((dist[i] / 3) * 4))
  const tex = new DataTexture(data, SIZE, SIZE, RedFormat, UnsignedByteType)
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}
