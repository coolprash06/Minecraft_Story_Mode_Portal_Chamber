/**
 * Original voxel models. Units are pixels (1/16 block) before each model's scale.
 * Conventions: models face +Z (front) unless noted, and are centred on x = 0 at their base.
 */
import { hash3 } from '../lib/random'
import { extrude, shieldVoxels, SPRITES } from '../gfx/pixelArt'
import { SLOT, VoxelSet, type Col } from '../gfx/voxel'
import type { ArmourFinish, WeaponKind } from '../world/layout'

const pick = (cols: string[], x: number, y: number, z: number, seed = 0) => cols[Math.floor(hash3(x, y, z, seed) * cols.length)]

const WOOD = ['#6b4a2b', '#5f4126', '#77532f', '#583b21']
const DARK_WOOD = ['#4e331c', '#452d18', '#563920']
const IRON = ['#3a3d44', '#43474f', '#33363c']

/* ───────────────────────────── torch ───────────────────────────── */

/** px → m for the wall torch (stick 2 × 10 px ≈ 0.19 × 0.94 m; matches TORCH.length). */
export const TORCH_SCALE = 0.094

/** Stick + iron collar; base at origin, stick up +Y. Head (glow) is separate so it can flicker. */
export function torchStick() {
  const v = new VoxelSet()
  v.box(-1, 0, -1, 1, 8, 1, (x, y, z) => pick(WOOD, x, y, z, 1))
  // iron collar around the lower third
  for (let x = -2; x < 2; x++) for (let z = -2; z < 2; z++) if (x === -2 || x === 1 || z === -2 || z === 1) v.set(x, 2, z, pick(IRON, x, 2, z), SLOT.metal)
  return v
}

export function torchHead() {
  const v = new VoxelSet()
  const HEAD = ['#fff6c8', '#ffd36a', '#ffb43c']
  v.box(-1, 8, -1, 1, 10, 1, (x, y, z) => (y === 9 ? HEAD[(x + z + 2) % 2] : HEAD[1 + ((x + z + 2) % 2)]), SLOT.glow)
  return v
}

/** Iron wall bracket: plate flat on the wall (local x = 0 plane, facing +X) with a short arm. */
export function torchBracket() {
  const v = new VoxelSet()
  v.box(0, -2, -2, 1, 4, 2, (x, y, z) => ((y === -2 || y === 3) && (z === -2 || z === 1) ? '#6a6e78' : pick(IRON, x, y, z, 2)), SLOT.metal)
  v.box(1, 0, -1, 3, 1, 1, '#3a3d44', SLOT.metal)
  return v
}

/* ───────────────────────────── lantern ───────────────────────────── */

export const LANTERN_SCALE = 0.11
/** Lantern height in px (body + handle); hanging lanterns hang from the top. */
export const LANTERN_PX_H = 11

/** Iron cage with a glowing core; origin at the bottom centre. */
export function lantern() {
  const v = new VoxelSet()
  const iron = (x: number, y: number, z: number) => pick(IRON, x, y, z, 3)
  v.box(-3, 0, -3, 3, 1, 3, iron, SLOT.metal) // base plate
  for (const x of [-3, 2]) for (const z of [-3, 2]) v.box(x, 1, z, x + 1, 6, z + 1, iron, SLOT.metal) // corner posts
  // glowing core, visible between the posts, with an iron mid-band
  const GLOW = ['#ffe6a8', '#ffcf7a', '#ffbf62']
  v.box(-2, 1, -2, 2, 6, 2, (x, y, z) => (y === 3 && (Math.abs(x + 0.5) > 1 || Math.abs(z + 0.5) > 1) ? null : pick(GLOW, x, y, z, 4)), SLOT.glow)
  for (let x = -3; x < 3; x++) for (const z of [-3, 2]) v.set(x, 3, z, '#2d3036', SLOT.metal)
  for (let z = -3; z < 3; z++) for (const x of [-3, 2]) v.set(x, 3, z, '#2d3036', SLOT.metal)
  v.box(-3, 6, -3, 3, 7, 3, iron, SLOT.metal) // top plate
  v.box(-2, 7, -2, 2, 8, 2, iron, SLOT.metal) // cap
  v.box(-1, 8, -1, 1, 9, 1, iron, SLOT.metal)
  // handle loop
  v.set(-2, 9, 0, '#2d3036', SLOT.metal).set(1, 9, 0, '#2d3036', SLOT.metal)
  v.box(-2, 10, 0, 2, 11, 1, '#2d3036', SLOT.metal)
  return v
}

/* ───────────────────────────── chain ───────────────────────────── */

export const CHAIN_SCALE = 0.085
/** One link: a 3 × 4 px ring in the XY plane; links alternate 90° about Y, 3 px apart. */
export function chainLink() {
  const v = new VoxelSet()
  const c = '#2b2d33'
  for (let y = 0; y < 4; y++) for (let x = -1; x < 2; x++) if (y === 0 || y === 3 || x !== 0) v.set(x, y, 0, c, SLOT.metal)
  return v
}
export const CHAIN_STEP_PX = 3

/* ───────────────────────────── chandelier ───────────────────────────── */

export const CHANDELIER_SCALE = 0.094
/** Gold chandelier with four arm lanterns; origin at the top (chain end), hanging down −Y. */
export function chandelier() {
  const v = new VoxelSet()
  const GOLD = ['#e0b13e', '#c9952c', '#f0c95a']
  const gold = (x: number, y: number, z: number) => pick(GOLD, x, y, z, 6)
  v.box(-1, -2, -1, 1, 0, 1, gold, SLOT.metal) // hook
  v.box(-1, -10, -1, 1, -2, 1, (x, y, z) => (y % 3 === 0 ? '#f0c95a' : gold(x, y, z)), SLOT.metal) // stem
  v.box(-2, -13, -2, 2, -10, 2, gold, SLOT.metal) // hub
  for (const [x, z] of [[-2, -1], [1, -1], [-1, -2], [-1, 1]]) v.set(x, -12, z, '#c0263a', SLOT.gem) // ruby studs
  v.box(-1, -16, -1, 1, -13, 1, gold, SLOT.metal) // finial
  v.set(0, -17, 0, '#f0c95a', SLOT.metal)
  // arms + a square ring at radius 8
  for (let r = 2; r <= 12; r++) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      v.set(dx * r - (dx < 0 ? 1 : 0), -12, dz * r - (dz < 0 ? 1 : 0), gold(r, 0, dx + dz), SLOT.metal)
    }
  }
  for (let i = -8; i < 8; i++) for (const e of [-9, 8]) {
    v.set(i, -12, e, gold(i, 1, e), SLOT.metal)
    v.set(e, -12, i, gold(e, 1, i), SLOT.metal)
  }
  // arm-end lanterns (4 × 6 px) hanging just under each arm tip
  const GLOW = ['#ffe6a8', '#ffcf7a', '#ffbf62']
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = dx * 12 - (dx < 0 ? 1 : 0)
    const cz = dz * 12 - (dz < 0 ? 1 : 0)
    const ox = cx - 1 - (dx === 0 ? 0 : 0)
    const oz = cz - 1
    v.box(ox - 1, -14, oz - 1, ox + 3, -13, oz + 3, gold, SLOT.metal)
    v.box(ox, -19, oz, ox + 2, -14, oz + 2, (x, y, z) => pick(GLOW, x, y, z, 7), SLOT.glow)
    for (const [px, pz] of [[ox - 1, oz - 1], [ox + 2, oz - 1], [ox - 1, oz + 2], [ox + 2, oz + 2]]) v.box(px, -19, pz, px + 1, -14, pz + 1, gold, SLOT.metal)
    v.box(ox - 1, -20, oz - 1, ox + 3, -19, oz + 3, gold, SLOT.metal)
  }
  return v
}

/* ───────────────────────────── armour stand ───────────────────────────── */

export const ARMOUR_SCALE = 1 / 16

const FINISH: Record<ArmourFinish, { dark: string; mid: string; light: string; trim: string; slot: number; trimSlot: number }> = {
  iron: { dark: '#6d727c', mid: '#a9aeb7', light: '#d8dce3', trim: '#d0a542', slot: SLOT.metal, trimSlot: SLOT.metal },
  gold: { dark: '#9c6b12', mid: '#d9a22b', light: '#ffd56a', trim: '#a3242c', slot: SLOT.metal, trimSlot: SLOT.matte },
  diamond: { dark: '#1e8f8a', mid: '#3fd1c8', light: '#9ff7ef', trim: '#e7eef5', slot: SLOT.gem, trimSlot: SLOT.metal },
}

/** Wooden stand on a stone slab, wearing a full armour set. Faces +Z, ~2.1 blocks tall. */
export function armourStand(finish: ArmourFinish) {
  const f = FINISH[finish]
  const v = new VoxelSet()
  const slot = f.slot as 0 | 1 | 2 | 3
  const trimSlot = f.trimSlot as 0 | 1 | 2 | 3
  // stand
  v.box(-6, 0, -6, 6, 1, 6, (x, y, z) => (x === -6 || x === 5 || z === -6 || z === 5 ? '#7d7a72' : pick(['#9a968c', '#a5a196', '#8f8b82'], x, y, z, 8)))
  v.box(-1, 1, -1, 1, 34, 1, (x, y, z) => pick(WOOD, x, y, z, 9))
  v.box(-8, 23, -1, 8, 25, 1, (x, y, z) => pick(WOOD, x, y, z, 10))

  // plate colouring: lighter top edges, darker lower edges, rivets on the corners
  const plate = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    v.box(x0, y0, z0, x1, y1, z1, (x, y, z): Col => {
      if (y === y1 - 1) return f.light
      if (y === y0) return f.dark
      const corner = (x === x0 || x === x1 - 1) && (z === z0 || z === z1 - 1)
      if (corner) return f.dark
      return hash3(x, y, z, 11) < 0.15 ? f.light : f.mid
    }, slot)

  // boots + greaves
  for (const lx of [-5, 0]) {
    plate(lx, 1, -3, lx + 5, 5, 3)
    v.box(lx, 1, 3, lx + 5, 2, 4, f.dark, slot) // toe
    plate(lx, 5, -3, lx + 5, 13, 3)
    v.box(lx + 1, 8, 3, lx + 4, 10, 4, f.light, slot) // knee cop
  }
  // belt with trim buckle
  v.box(-5, 13, -3, 5, 15, 3, f.dark, slot)
  v.box(-1, 13, 3, 1, 15, 4, f.trim, trimSlot)
  // cuirass with a raised ridge and trim along the neckline
  plate(-5, 15, -3, 5, 25, 3)
  v.box(-1, 16, 3, 1, 24, 4, f.light, slot)
  v.box(-4, 24, 3, 4, 25, 4, f.trim, trimSlot)
  // pauldrons + vambraces
  for (const [x0, x1] of [[-9, -5], [5, 9]]) {
    plate(x0, 21, -3, x1, 26, 3)
    plate(x0 + (x0 < 0 ? 1 : 0), 14, -2, x1 - (x0 < 0 ? 0 : 1), 21, 2)
    v.box(x0, 25, -3, x1, 26, 3, f.trim, trimSlot)
  }
  // helmet: visor slit + nose guard, crest on top
  plate(-5, 25, -5, 5, 34, 5)
  for (let x = -4; x < 4; x++) v.set(x, 30, 4, '#101114')
  for (let x = -4; x < 4; x++) if (x < -1 || x > 0) v.set(x, 29, 4, '#16181c')
  v.box(-1, 27, 5, 1, 31, 6, f.light, slot)
  v.box(-1, 34, -4, 1, 36, 5, f.trim, trimSlot)
  return v
}

/* ───────────────────────────── weapons ───────────────────────────── */

export const ITEM_SCALE = 0.08

export function weapon(kind: WeaponKind) {
  return extrude(SPRITES[kind])
}

export function shield(crest: number) {
  return shieldVoxels(crest)
}

/* ───────────────────────────── weapon rack ───────────────────────────── */

export const RACK_SCALE = 1 / 16

/** Floor rack (28 px wide): base, two uprights, a top rail with pegs. Faces +Z. */
export function rackFrame() {
  const v = new VoxelSet()
  const wood = (x: number, y: number, z: number) => pick(DARK_WOOD, x, y, z, 12)
  v.box(-14, 0, -3, 14, 2, 3, wood) // base
  for (const x of [-14, 12]) v.box(x, 2, -1, x + 2, 24, 1, wood) // uprights
  v.box(-14, 22, -1, 14, 24, 1, wood) // top rail
  v.box(-12, 8, -3, 12, 9, -2, wood) // back rail
  for (let x = -10; x <= 10; x += 5) v.box(x, 21, 1, x + 1, 22, 3, '#e0b13e', SLOT.metal) // gold pegs
  return v
}

/* ───────────────────────────── banner rod ───────────────────────────── */

/** Gold rod with finials (34 px wide) + two wall brackets. Origin at the rod centre. */
export function bannerRod() {
  const v = new VoxelSet()
  const GOLD = ['#e0b13e', '#c9952c', '#f0c95a']
  v.box(-15, 0, 0, 15, 1, 1, (x, y, z) => pick(GOLD, x, y, z, 13), SLOT.metal)
  for (const x of [-17, 15]) v.box(x, -1, 0, x + 2, 2, 1, '#f0c95a', SLOT.metal)
  for (const x of [-11, 10]) v.box(x, 0, -3, x + 1, 1, 0, '#8f6a1c', SLOT.metal)
  return v
}

/* ───────────────────────────── portrait frame ───────────────────────────── */

export const FRAME_SCALE = 1 / 16
/** Canvas opening in px (matches the painting: 16 px per block) and the moulding width. */
export const FRAME_OPENING = { w: 36, h: 44, ring: 4 } as const

/**
 * Ornate gold frame for the Founding King. Back on the wall (z = 0), front +Z, origin at the
 * bottom centre of the outer edge. Stepped moulding (outer lip, beaded ridge, inner shadow lip),
 * ruby rosettes on the corners, small lozenges mid-side, and a crown cartouche on top.
 */
export function portraitFrame() {
  const v = new VoxelSet()
  const { w, h, ring } = FRAME_OPENING
  const W = w + ring * 2
  const H = h + ring * 2
  const x0 = -W / 2
  const GOLD = ['#e0b13e', '#c9952c', '#d6a637']
  const gold = (x: number, y: number, z: number) => pick(GOLD, x, y, z, 21)
  // moulding profile across the ring (0 = outer edge): depth in px and tone
  const DEPTH = [2, 3, 3, 1]
  for (let y = 0; y < H; y++)
    for (let x = x0; x < x0 + W; x++) {
      const i = Math.min(x - x0, x0 + W - 1 - x, y, H - 1 - y)
      if (i >= ring) continue
      const litSide = x - x0 === i || H - 1 - y === i // left and top faces catch the light
      for (let z = 0; z < DEPTH[i]; z++) {
        let c: string = gold(x, y, z)
        if (i === 1 && z === 2) c = litSide ? '#ffe58f' : '#f0c95a'
        if (i === 3) c = '#8a6418'
        v.set(x, y, z, c, SLOT.metal)
      }
      // beads along the ridge
      const along = i === 1 ? (x - x0 === 1 || x0 + W - 2 - x === 0 ? y : x) : 0
      if (i === 1 && along % 3 === 0) v.set(x, y, 3, '#f0c95a', SLOT.metal)
    }
  // corner rosettes with a ruby boss
  const rosette = (cx: number, cy: number, r: number, gem: string) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.abs(dx) + Math.abs(dy)
        if (d > r) continue
        v.set(cx + dx, cy + dy, 3, d === r ? '#c9952c' : '#f0c95a', SLOT.metal)
        if (d < r) v.set(cx + dx, cy + dy, 4, d === 0 ? gem : '#e0b13e', d === 0 ? SLOT.gem : SLOT.metal)
      }
  }
  for (const cx of [x0 + 1, x0 + W - 2]) for (const cy of [1, H - 2]) rosette(cx, cy, 3, '#d22a3a')
  for (const cx of [x0 + 1, x0 + W - 2]) rosette(cx, Math.floor(H / 2), 2, '#d22a3a')
  rosette(0, 1, 2, '#d22a3a')
  // crown cartouche above the top edge: band, three points, a cyan stone
  v.box(-7, H, 0, 7, H + 2, 2, (x, y, z) => (y === H + 1 && z === 1 ? '#f0c95a' : gold(x, y, z)), SLOT.metal)
  for (const [px, tall] of [
    [-7, 3],
    [-6, 2],
    [-1, 4],
    [0, 4],
    [5, 2],
    [6, 3],
  ] as const)
    v.box(px, H + 2, 0, px + 1, H + 2 + tall, 2, '#e0b13e', SLOT.metal)
  for (const px of [-7, -1, 0, 6]) v.set(px, H + 2 + (px === -1 || px === 0 ? 4 : 3), 0, '#ffe58f', SLOT.metal)
  v.box(-1, H, 2, 1, H + 2, 3, '#1fc8e0', SLOT.gem)
  return v
}
