/**
 * The showcase stage, in the hall's style: the same blue-grey stone brick (4-px courses,
 * staggered, dark mortar), a red carpet runner with gold edges, a round stone plinth topped with
 * carpet and a gold ring, two wall banners (original crossed-daggers-over-waves design) and two
 * wall torches. 1 px = 1/16 m. Geometry only; lit with ordinary three.js lights.
 */
import { hash3 } from '../lib/random'
import { partsToGeometry, SLOT, VoxelSet } from '../gfx/voxel'

export const SPX = 1 / 16

const BRICK = ['#2c2f3a', '#343846', '#3c404e', '#464b5a']
const MORTAR = '#14151b'
const GOLD = ['#e0b13e', '#c9952c', '#f0c95a']
const CARPET = ['#8c1a22', '#7e161e', '#961e27']
const pick = (cols: string[], x: number, y: number, z: number, seed: number) => cols[Math.floor(hash3(x, y, z, seed) * cols.length)]

/** Brick colour on a face whose in-plane coordinates are (u along the course, v across). */
function brick(u: number, v: number, seed: number) {
  const row = Math.floor(v / 4)
  const off = row % 2 === 0 ? 0 : 4
  const bu = (((u + off) % 8) + 8) % 8
  if (((v % 4) + 4) % 4 === 3 || bu === 7) return MORTAR
  const id = Math.floor((u + off) / 8) * 7 + row * 13
  const base = BRICK[Math.floor(hash3(id, row, 0, seed) * BRICK.length)]
  return hash3(u, v, seed, 3) < 0.12 ? '#262833' : base
}

/** Floor (z −2…3 m), back wall, carpet runner. Static. */
export function stageRoom() {
  const v = new VoxelSet()
  for (let x = -48; x < 48; x++) for (let z = -32; z < 48; z++) v.set(x, -1, z, brick(x, z, 1))
  for (let x = -48; x < 48; x++) for (let y = 0; y < 60; y++) v.set(x, y, -33, brick(x, y, 2))
  // skirting course along the wall
  for (let x = -48; x < 48; x++) v.set(x, 0, -32, '#22242d').set(x, 1, -32, '#2a2d37')
  // runner from the plinth to the front
  for (let x = -7; x < 7; x++)
    for (let z = 10; z < 48; z++) {
      const edge = x === -7 || x === 6
      v.set(x, 0, z, edge ? pick(GOLD, x, 0, z, 4) : pick(CARPET, x, 0, z, 5), edge ? SLOT.metal : SLOT.matte)
    }
  return partsToGeometry(v.mesh(SPX))
}

/** Round plinth (radius 12 px, 4 px high): stone sides, carpet top, gold ring. Turns with the pirate. */
export const PLINTH_H = 4 * SPX
export function plinth() {
  const v = new VoxelSet()
  for (let x = -13; x < 13; x++)
    for (let z = -13; z < 13; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5)
      if (r > 12.6) continue
      for (let y = 0; y < 4; y++) {
        if (y < 3) {
          // stone, the lowest course a shade darker
          const a = Math.atan2(z + 0.5, x + 0.5)
          v.set(x, y, z, y === 0 ? '#22242d' : brick(Math.round(a * 12), y + 1, 6))
        } else if (r > 11.2) v.set(x, y, z, pick(GOLD, x, y, z, 7), SLOT.metal)
        else if (r > 10) v.set(x, y, z, '#5e1016')
        else v.set(x, y, z, pick(CARPET, x, y, z, 8))
      }
    }
  return partsToGeometry(v.mesh(SPX))
}

/** Banner, 16 × 28 px, hanging from a rod: navy, gold border, crossed daggers over waves. */
export function banner() {
  const v = new VoxelSet()
  const W = 16
  const H = 28
  for (let x = 0; x < W; x++)
    for (let r = 0; r < H; r++) {
      const y = H - 1 - r // r = row from the top
      // swallowtail: a V notch in the bottom 4 rows
      const fromBottom = H - 1 - r
      if (fromBottom < 4 && Math.abs(x - 7.5) < (4 - fromBottom) * 1.6) continue
      let c = hash3(x, r, 0, 9) < 0.15 ? '#18223d' : '#1c2848'
      let slot: (typeof SLOT)[keyof typeof SLOT] = SLOT.matte
      const border = x === 0 || x === W - 1 || r === 0 || (fromBottom < 5 && Math.abs(Math.abs(x - 7.5) - (4 - fromBottom) * 1.6) < 1)
      if (border) {
        c = pick(GOLD, x, r, 0, 10)
        slot = SLOT.metal
      } else {
        // two waves
        for (const wy of [19, 22]) if (r === wy + Math.round(Math.sin((x + wy) * 1.1))) c = '#3f8fa8'
        // crossed daggers: two diagonals from row 4 to row 15, hilts at the top
        const d1 = x - 3 - (r - 4) * (9 / 11)
        const d2 = x - 12 + (r - 4) * (9 / 11)
        if (r >= 4 && r <= 15 && (Math.abs(d1) < 0.5 || Math.abs(d2) < 0.5)) {
          c = r <= 6 ? GOLD[0] : '#d5dbe3'
          slot = SLOT.metal
        }
        if (r === 6 && (x === 2 || x === 6 || x === 9 || x === 13)) {
          c = GOLD[1]
          slot = SLOT.metal
        }
      }
      v.set(x - W / 2, y, 0, c, slot)
    }
  // rod
  for (let x = -W / 2 - 2; x < W / 2 + 2; x++) v.set(x, H, 1, x < -W / 2 || x >= W / 2 ? pick(GOLD, x, 0, 0, 11) : '#5f4126', x < -W / 2 || x >= W / 2 ? SLOT.metal : SLOT.matte)
  return partsToGeometry(v.mesh(SPX))
}

/** Wall torch: iron plate on the wall, a short arm, an upright stick; the head is separate (glow). */
export function torch() {
  const v = new VoxelSet()
  v.box(-1, -3, 0, 2, 3, 1, (x, y, z) => (hash3(x, y, z, 12) < 0.3 ? '#4a4e57' : '#3a3d44'), SLOT.metal)
  v.box(0, 0, 1, 1, 1, 4, '#3a3d44', SLOT.metal)
  v.box(0, 0, 3, 1, 9, 4, (x, y, z) => (hash3(x, y, z, 13) < 0.4 ? '#5f4126' : '#6b4a2b'))
  v.box(-1, 2, 2, 2, 3, 5, '#2d3036', SLOT.metal) // collar
  const head = new VoxelSet()
  const HEAD = ['#fff6c8', '#ffd36a', '#ffb43c']
  head.box(-1, 9, 2, 2, 11, 5, (x, y, z) => (y === 10 ? HEAD[(x + z + 4) % 2] : HEAD[1 + ((x + z + 4) % 2)]), SLOT.glow)
  return { body: partsToGeometry(v.mesh(SPX)), head: partsToGeometry(head.mesh(SPX)) }
}
