/**
 * Pirate voxel models, built from a PirateDef (config/pirates.ts) alone.
 *
 * Rig: head (pivot at the neck), torso (pivot at the hips), two arms (shoulders), two legs (hips).
 * Each part is a VoxelSet whose surface voxels are its "skin": painted procedurally, pixel by
 * pixel, from the palette, the face sprite and the outfit, with voxel accessories on top.
 * 1 px = 1/16 block. Models face +Z; the character's right is −X. Feet on y = 0.
 *
 * Proportions are the crew's own: a deeper torso than wide-and-flat, narrow arms with skin-coloured
 * hands under sleeves and cuffs, booted legs with a toe cap, and an 8³ head with a human face
 * (small shaded nose, brows, two-tone eyes).
 */
import { Color, type BufferGeometry } from 'three'
import type { PirateDef, PiratePalette } from '../config/pirates'
import { hash3 } from '../lib/random'
import { partsToGeometry, SLOT, VoxelSet, type Slot } from '../gfx/voxel'

/** px → m. */
export const PX = 1 / 16
export const TORSO_H = 11
const HEAD = 8

export type Eyes = 'open' | 'narrow' | 'closed'

export interface PirateDims {
  W: number
  D: number
  armW: number
  armD: number
  armH: number
  legW: number
  legD: number
  legH: number
  /** y of the neck (top of the torso). */
  neck: number
  zt0: number
  legZ0: number
  armZ0: number
}

export function pirateDims(def: PirateDef): PirateDims {
  const b = def.build
  const legD = Math.max(3, b.torsoD - 1)
  return {
    W: b.torsoW,
    D: b.torsoD,
    armW: b.armW,
    armD: b.armW,
    armH: TORSO_H,
    legW: b.torsoW / 2,
    legD,
    legH: b.legH,
    neck: b.legH + TORSO_H,
    zt0: -Math.floor(b.torsoD / 2),
    legZ0: -Math.floor(legD / 2),
    armZ0: -Math.floor(b.armW / 2),
  }
}

type Px = [string, Slot]
const M = SLOT.matte

const mixCache = new Map<string, string>()
function mix(a: string, b: string, t: number) {
  const k = `${a}${b}${t}`
  let v = mixCache.get(k)
  if (!v) {
    v = `#${new Color(a).lerp(new Color(b), t).getHexString()}`
    mixCache.set(k, v)
  }
  return v
}

/** Fabric / skin variation: an occasional slightly darker or lighter pixel. */
function vary(c: string, x: number, y: number, z: number, seed: number, amount = 0.08): string {
  const n = hash3(x, y, z, seed)
  if (n < 0.14) return mix(c, '#000000', amount)
  if (n > 0.9) return mix(c, '#ffffff', amount * 0.7)
  return c
}

const EYE_WHITE = '#f2eee4'
const TEETH = '#efe9da'
const PATCH = '#141317'
const HAT = '#17161b'
const BLADE = '#cfd5dd'
const BLADE_EDGE = '#f3f6fa'
const IRON = '#5d626b'
const WOOD = '#5f4126'
const BRASS = '#c9a04a'
const RUBY = '#d4213a'
const SAPPHIRE = '#2a7be0'
const LEATHER = '#4a3020'
const PAGES = '#efe6cf'
const IVORY = '#e8dcc0'

/* ───────────────────────────── head ───────────────────────────── */

function eyeVariant(row: string, eyes: Eyes) {
  if (eyes === 'open') return row
  // narrowed: the whites become a heavy lid, the pupil stays; closed: one dark lash line
  return eyes === 'narrow' ? row.replace(/W/g, 'l') : row.replace(/[WP]/g, 'l')
}

function faceChar(ch: string, p: PiratePalette, x: number, y: number, z: number): Px {
  switch (ch) {
    case 'S':
    case 'n':
      return [p.skinShade, M]
    case 'h':
    case 'B':
      return [hash3(x, y, z, 11) < 0.3 ? p.hairDark : p.hair, M]
    case 'H':
    case 'b':
    case 'M':
      return [p.hairDark, M]
    case 'W':
      return [EYE_WHITE, M]
    case 'P':
      return [p.eye, M]
    case 'l':
      return [mix(p.skinShade, '#2a1810', 0.45), M]
    case 'm':
      return [p.mouth, M]
    case 't':
      return [TEETH, M]
    case 'k':
      return [mix(p.skin, '#e0604e', 0.35), M]
    case 'f':
      return [mix(p.skinShade, '#8a4a2a', 0.45), M]
    case 'u':
      return [mix(p.skin, p.hair, hash3(x, y, z, 12) < 0.5 ? 0.45 : 0.3), M]
    case 'x':
      return [mix(p.skinShade, '#8a2a2a', 0.45), M]
    case 'e':
      return [PATCH, M]
    case 'g':
      return [p.trim, SLOT.metal]
    case 'o':
      return [mix(p.skin, '#2b2624', hash3(x, y, z, 13) < 0.5 ? 0.75 : 0.6), M]
    case 'D':
      return [vary(p.accent, x, y, z, 14), M]
    default:
      return [vary(p.skin, x, y, z, 15, 0.05), M]
  }
}

function hairPx(p: PiratePalette, x: number, y: number, z: number): Px {
  return [hash3(x, y, z, 16) < 0.28 ? p.hairDark : p.hair, M]
}

/** Sides, back and top of the head (row r from the top, 0..7). */
function headShell(def: PirateDef, r: number, x: number, y: number, z: number, side: boolean, back: boolean, top: boolean): Px {
  const p = def.palette
  const acc = def.accessories
  if (acc.includes('bandana') && (top || r <= 1)) return [vary(p.accent, x, y, z, 17), M]
  if (top) {
    if (def.hair === 'bald') return [hash3(x, y, z, 18) < 0.12 ? mix(p.skin, '#ffffff', 0.25) : p.skin, M]
    return hairPx(p, x, y, z)
  }
  // eyepatch strap: rises from the patch across the left side of the head
  if (acc.includes('eyepatch') && x === 3 && side && r === (z >= 1 ? 2 : z >= -2 ? 1 : 0)) return [PATCH, M]
  if (acc.includes('eyepatch') && back && r === 0) return [PATCH, M]
  if (acc.includes('spectacles') && side && r === 3 && z >= 0) return [p.trim, SLOT.metal]
  let hair = false
  switch (def.hair) {
    case 'short':
      hair = back ? r <= 5 : r <= 2 || (z <= -2 && r <= 4)
      break
    case 'long':
      hair = back ? true : r <= 4 || z <= -2
      break
    case 'braids':
      hair = back ? true : r <= 5 || z <= -1
      break
    case 'bald':
      hair = back ? r >= 3 && r <= 5 : r >= 3 && r <= 5 && z <= -2
      break
  }
  if (hair) return hairPx(p, x, y, z)
  if (side && r === 4 && z === 0) return [p.skinShade, M] // ear
  if (r === 7) return [p.skinShade, M] // jaw underside edge
  return [vary(p.skin, x, y, z, 19, 0.05), M]
}

function buildHead(def: PirateDef, d: PirateDims, eyes: Eyes) {
  const v = new VoxelSet()
  const p = def.palette
  const acc = new Set(def.accessories)
  const rows = def.face.map((r) => eyeVariant(r, eyes))
  const y0 = d.neck
  for (let x = -4; x < 4; x++)
    for (let y = 0; y < HEAD; y++)
      for (let z = -4; z < 4; z++) {
        const side = x === -4 || x === 3
        const back = z === -4
        const front = z === 3
        const top = y === HEAD - 1
        const bottom = y === 0
        if (!side && !back && !front && !top && !bottom) continue
        const r = HEAD - 1 - y
        let px: Px
        if (front) px = faceChar(rows[r][x + 4], p, x, y, z)
        else if (bottom && !side && !back) px = [p.skinShade, M]
        else px = headShell(def, r, x, y, z, side, back, top)
        v.set(x, y0 + y, z, px[0], px[1])
      }

  // features that stand proud of the face: beard, spectacle frames, eyepatch
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const stand = (ch === 'B' && r >= 4) || ((ch === 'g' || ch === 'e') && r >= 2 && r <= 4)
      if (!stand) return
      const [col, slot] = faceChar(ch, p, c, r, 4)
      v.set(c - 4, y0 + HEAD - 1 - r, 4, col, slot)
    }),
  )

  if (acc.has('beard')) {
    const beard = (x: number, y: number, z: number) => v.set(x, y, z, hash3(x, y, z, 20) < 0.35 ? p.hairDark : p.hair)
    for (let x = -4; x < 4; x++) for (const z of [3, 4]) beard(x, y0 - 1, z)
    for (let x = -3; x < 3; x++) for (const z of [3, 4]) beard(x, y0 - 2, z)
    for (let x = -2; x < 2; x++) beard(x, y0 - 3, 4)
  }

  if (acc.has('tricorn')) {
    // A crown over the head and a wide brim pinned up on three sides (left, right, back), the
    // front drawn out to a point over the brow. The turned-up edges are trimmed in gold.
    const hy = y0 + HEAD - 1
    const inBrim = (x: number, z: number) => z >= -6 && z <= 6 && Math.abs(x + 0.5) <= 6.5 - Math.max(0, z - 2) * 1.6
    for (let z = -6; z <= 6; z++)
      for (let x = -7; x < 7; x++) {
        if (!inBrim(x, z)) continue
        v.set(x, hy, z, HAT)
        const edge = !(inBrim(x - 1, z) && inBrim(x + 1, z) && inBrim(x, z - 1) && inBrim(x, z + 1))
        if (!edge) continue
        const wall = z >= 3 ? 1 : 2 // lower towards the front point
        for (let k = 1; k <= wall; k++) v.set(x, hy + k, z, k === wall ? p.trim : HAT, k === wall ? SLOT.metal : SLOT.matte)
      }
    v.box(-4, hy + 1, -4, 4, hy + 4, 3, (x, y, z) => (y === hy + 1 ? '#2a2830' : vary(HAT, x, y, z, 21)))
    v.box(-3, hy + 4, -3, 3, hy + 5, 2, HAT)
  }

  if (acc.has('bandana')) {
    // knot and two tails at the back
    for (const x of [-1, 0]) for (const y of [y0 + 6, y0 + 7]) v.set(x, y, -5, p.accent)
    for (const y of [y0 + 3, y0 + 4, y0 + 5]) v.set(-1, y, -5, p.accentShade)
    for (const y of [y0 + 4, y0 + 5]) v.set(0, y, -5, p.accentShade)
  }

  if (acc.has('earring')) {
    v.set(4, y0 + 3, 0, p.trim, SLOT.metal)
    v.set(4, y0 + 2, 0, p.trim, SLOT.metal)
    v.set(4, y0 + 2, -1, p.trim, SLOT.metal)
  }

  if (acc.has('braids')) {
    for (const bx of [-3, 2])
      for (let y = y0 + 5; y >= y0 - 7; y--) {
        const z = y >= y0 + 2 ? -5 : y >= y0 ? -4 : -3
        const col = y === y0 - 6 ? p.accent : (y + bx) % 2 === 0 ? p.hair : p.hairDark
        v.set(bx, y, z, col)
        if (y === y0 + 2 || y === y0) v.set(bx, y, z - 1, p.hair) // joins the steps
      }
  }
  return v
}

/* ───────────────────────────── torso ───────────────────────────── */

interface Surf {
  x: number
  y: number
  z: number
  /** Row from the bottom of the part. */
  fy: number
  front: boolean
  back: boolean
  side: boolean
  top: boolean
  /** Distance of the column centre from the middle (0.5 = the two middle columns). */
  cx: number
}

function torsoPaint(def: PirateDef, s: Surf): Px {
  const p = def.palette
  const H = TORSO_H
  const W = def.build.torsoW
  const { x, y, z, fy, front, back, side, top, cx } = s
  const belt = fy === 1
  const beltPx = (): Px => (front && cx < 1 ? [p.trim, SLOT.metal] : [vary(p.belt, x, y, z, 30), M])

  switch (def.outfit) {
    case 'longcoat':
    case 'coat': {
      const long = def.outfit === 'longcoat'
      if (belt) return beltPx()
      if (front && cx < 1) return [fy >= H - 3 || fy % 2 === 0 ? p.shirt : p.shirtShade, M] // shirt / ruffles
      if (front && cx < 2) return long ? [p.trim, SLOT.metal] : [p.outerShade, M] // trimmed edge / lapel
      if (front && cx < 3 && fy % 2 === 0 && fy > 1 && fy < H - 1) return [p.trim, SLOT.metal] // buttons
      if (top && (front || back) && cx < 3) return [p.outerShade, M] // collar
      return [vary(p.outer, x, y, z, 31), M]
    }
    case 'waistcoat': {
      if (belt) return beltPx()
      if (top || (side && fy >= H - 3)) return [vary(p.shirt, x, y, z, 32, 0.05), M]
      if (front) {
        if (fy >= H - 3 && cx < 1) return [fy === H - 2 ? p.accent : p.accentShade, M] // cravat
        if (fy >= H - 4 && cx < 2) return [p.shirt, M] // V opening
        if (cx < 1 && fy % 2 === 0 && fy >= 2) return [p.trim, SLOT.metal]
        if (fy === 0) return [p.outerShade, M]
      }
      return [vary(p.outer, x, y, z, 33), M]
    }
    case 'apron': {
      const bib = front && fy <= H - 2 && (fy < H - 4 ? cx < W / 2 - 1 : cx < 2)
      if (bib) return apronPx(p, x, y, z)
      if ((top || back) && cx > 1 && cx < 2.5 && (top || fy >= H - 3)) return [p.outer, M] // straps
      if (back && fy === 1) return [p.outerShade, M] // apron tie
      if (belt) return beltPx()
      return [vary(p.shirt, x, y, z, 34), M]
    }
    case 'striped': {
      if (belt) return beltPx()
      if (front && fy >= H - 2 && cx < 1) return [p.skin, M] // open collar
      return [fy % 2 === 0 ? p.shirtShade : vary(p.shirt, x, y, z, 35, 0.05), M]
    }
    case 'vest': {
      if (belt) return beltPx()
      const soot = hash3(x, y, z, 36) < 0.07
      if (top || (side && fy >= H - 3)) return [soot ? '#3b3330' : vary(p.shirt, x, y, z, 37, 0.05), M]
      if (front && cx < 1) return [fy % 2 === 1 && fy < H - 2 ? p.trim : p.shirt, M] // laced opening
      if (front && cx < 2) return [p.outerShade, M] // stitched edge
      return [soot ? '#3b3330' : vary(p.outer, x, y, z, 38, 0.1), M]
    }
  }
}

/** Off-white apron with cooking stains. */
function apronPx(p: PiratePalette, x: number, y: number, z: number): Px {
  const n = hash3(x, y, z, 39)
  if (n < 0.08) return [p.accent, M]
  if (n < 0.12) return [p.accentShade, M]
  return [n > 0.85 ? p.outerShade : p.outer, M]
}

function buildTorso(def: PirateDef, d: PirateDims) {
  const v = new VoxelSet()
  const p = def.palette
  const { W, D, zt0, legH } = d
  const zt1 = zt0 + D
  for (let x = -W / 2; x < W / 2; x++)
    for (let fy = 0; fy < TORSO_H; fy++)
      for (let z = zt0; z < zt1; z++) {
        const side = x === -W / 2 || x === W / 2 - 1
        const s: Surf = { x, y: legH + fy, z, fy, front: z === zt1 - 1, back: z === zt0, side, top: fy === TORSO_H - 1, cx: Math.abs(x + 0.5) }
        if (!s.front && !s.back && !side && !s.top && fy !== 0) continue
        const [c, slot] = torsoPaint(def, s)
        v.set(x, s.y, z, c, slot)
      }
  const acc = new Set(def.accessories)

  if (acc.has('belly'))
    for (let x = -W / 2 + 2; x < W / 2 - 2; x++)
      for (let fy = 2; fy < 8; fy++) {
        const [c, slot] = def.outfit === 'apron' ? apronPx(p, x, legH + fy, zt1) : [p.shirt, M]
        v.set(x, legH + fy, zt1, c, slot)
      }

  const front = acc.has('belly') ? zt1 + 1 : zt1

  if (acc.has('ledger')) {
    // a small book hanging from the belt on the left front, a strap over the belt
    v.box(1, legH - 3, front, 4, legH + 1, front + 2, (x, y, z) => (x === 3 && z === front ? PAGES : y === legH ? '#6a3424' : '#5a2a1e'))
    v.set(2, legH + 1, front, '#3a2014')
    v.set(2, legH - 1, front + 2, p.trim, SLOT.metal) // clasp
  }

  if (acc.has('ladle')) {
    const lx = -W / 2 + 1
    v.box(lx, legH - 4, front, lx + 1, legH + 3, front + 1, IRON, SLOT.metal) // handle
    v.box(lx - 1, legH - 6, front, lx + 2, legH - 4, front + 2, (x, y) => (y === legH - 6 ? '#4b5058' : '#7a8088'), SLOT.metal) // bowl
  }

  if (acc.has('sheath')) {
    const sx = acc.has('ladle') ? -W / 2 + 3 : -W / 2 + 1
    v.box(sx, legH - 2, front, sx + 1, legH + 2, front + 1, LEATHER)
    v.set(sx, legH - 3, front, IRON, SLOT.metal) // chape
  }

  if (acc.has('spyglass')) {
    // strap from the right shoulder to the left hip, front and back
    for (let fy = 1; fy < TORSO_H; fy++) {
      const fx = Math.round(1 + ((TORSO_H - 1 - fy) * (W - 3)) / (TORSO_H - 2))
      v.set(-W / 2 + fx, legH + fy, zt1 - 1, LEATHER)
      v.set(-W / 2 + fx, legH + fy, zt0, LEATHER)
    }
    // the spyglass itself, slung diagonally across the back
    for (let i = 0; i < 8; i++) {
      const x = -W / 2 + 1 + i * ((W - 3) / 7)
      const y = legH + 9 - i
      const col = i === 0 ? '#9fd3e8' : i === 3 || i === 6 ? '#5a4632' : BRASS
      const slot = i === 0 ? SLOT.gem : SLOT.metal
      v.set(Math.round(x), y, zt0 - 1, col, slot)
      v.set(Math.round(x), y + 1, zt0 - 1, i === 0 ? '#9fd3e8' : col === BRASS ? '#e0bc6a' : col, slot)
    }
  }

  if (acc.has('powderHorn')) {
    // strap from the left shoulder to the right hip
    for (let fy = 2; fy < TORSO_H; fy++) {
      const fx = Math.round(W - 2 - ((TORSO_H - 1 - fy) * (W - 3)) / (TORSO_H - 3))
      const xx = -W / 2 + Math.max(0, Math.min(W - 1, fx))
      v.set(xx, legH + fy, zt1 - 1, LEATHER)
      v.set(xx, legH + fy, zt0, LEATHER)
    }
    // the horn: an ivory curve at the right hip, a brass cap, a dark tip
    const hx = -W / 2
    const horn: [number, number, string][] = [
      [hx, legH + 2, BRASS],
      [hx, legH + 1, IVORY],
      [hx, legH, IVORY],
      [hx + 1, legH - 1, mix(IVORY, '#b8a07a', 0.4)],
      [hx + 2, legH - 1, mix(IVORY, '#b8a07a', 0.7)],
      [hx + 3, legH - 2, '#5a4632'],
    ]
    for (const [x, y, c] of horn) {
      v.set(x, y, front, c, c === BRASS ? SLOT.metal : M)
      if (y >= legH) v.set(x, y, front + 1, c, c === BRASS ? SLOT.metal : M)
    }
  }
  return v
}

/* ───────────────────────────── arms ───────────────────────────── */

function sleevePx(def: PirateDef, fy: number, top: boolean, outer: boolean, x: number, y: number, z: number): Px {
  const p = def.palette
  if (fy < 3) return [fy === 0 ? p.skinShade : vary(p.skin, x, y, z, 40, 0.05), M] // hand
  switch (def.outfit) {
    case 'longcoat':
      if (fy <= 4) return [p.trim, SLOT.metal] // deep gold cuffs
      if (fy === 5) return [p.outerShade, M]
      if (top && outer) return [p.trim, SLOT.metal] // epaulette edge
      return [vary(p.outer, x, y, z, 41), M]
    case 'coat':
      if (fy === 3) return [p.outerShade, M]
      return [vary(p.outer, x, y, z, 42), M]
    case 'waistcoat':
      if (fy === 3) return [p.shirtShade, M]
      return [vary(p.shirt, x, y, z, 43, 0.05), M]
    case 'apron':
      if (fy <= 6) return [vary(p.skin, x, y, z, 44, 0.05), M] // rolled sleeves
      if (fy === 7) return [p.shirtShade, M]
      return [vary(p.shirt, x, y, z, 45), M]
    case 'striped':
      if (fy === 3) return [p.shirt, M]
      return [fy % 2 === 0 ? p.shirtShade : p.shirt, M]
    case 'vest':
      if (fy <= 5) return [hash3(x, y, z, 46) < 0.1 ? '#3b3330' : vary(p.skin, x, y, z, 47, 0.05), M]
      if (fy === 6) return [p.shirtShade, M]
      return [vary(p.shirt, x, y, z, 48, 0.05), M]
  }
}

function buildArm(def: PirateDef, d: PirateDims, right: boolean) {
  const v = new VoxelSet()
  const { W, armW, armD, armH, neck, armZ0 } = d
  const x0 = right ? -W / 2 - armW : W / 2
  const yb = neck - armH
  for (let x = x0; x < x0 + armW; x++)
    for (let fy = 0; fy < armH; fy++)
      for (let z = armZ0; z < armZ0 + armD; z++) {
        const outer = right ? x === x0 : x === x0 + armW - 1
        const inner = right ? x === x0 + armW - 1 : x === x0
        const top = fy === armH - 1
        if (!outer && !inner && !top && fy !== 0 && z !== armZ0 && z !== armZ0 + armD - 1) continue
        const [c, slot] = sleevePx(def, fy, top, outer, x, yb + fy, z)
        v.set(x, yb + fy, z, c, slot)
      }
  if (right) addDagger(v, def, x0 + Math.floor(armW / 2), yb + 1, armZ0 + armD - 1, armZ0)
  return v
}

/** Dagger held in the fist, blade forward (+Z); `zf` = the hand's front face, `zb` its back. */
function addDagger(v: VoxelSet, def: PirateDef, x: number, y: number, zf: number, zb: number) {
  const jewelled = def.dagger === 'jewelled'
  const guard = jewelled ? def.palette.trim : IRON
  v.set(x, y, zf + 1, jewelled ? '#5a1a1a' : WOOD) // grip, between fist and guard
  for (const gx of [x - 1, x, x + 1]) v.set(gx, y, zf + 2, guard, SLOT.metal)
  v.set(x, y + 1, zf + 2, guard, SLOT.metal)
  v.set(x, y - 1, zf + 2, guard, SLOT.metal)
  if (jewelled) {
    v.set(x - 1, y, zf + 2, SAPPHIRE, SLOT.gem)
    v.set(x + 1, y, zf + 2, SAPPHIRE, SLOT.gem)
  }
  for (let z = zf + 3; z <= zf + 8; z++) v.set(x, y, z, BLADE, SLOT.metal)
  for (let z = zf + 3; z <= zf + 6; z++) v.set(x, y + 1, z, BLADE_EDGE, SLOT.metal)
  v.set(x, y, zf + 9, BLADE_EDGE, SLOT.metal) // point
  v.set(x, y, zb - 1, jewelled ? RUBY : IRON, jewelled ? SLOT.gem : SLOT.metal) // pommel
}

/* ───────────────────────────── legs ───────────────────────────── */

function legPx(def: PirateDef, d: PirateDims, s: Surf, inner: boolean): Px {
  const p = def.palette
  const { fy, front, x, y, z } = s
  const { bootH, shins = 0 } = def.build
  if (fy < bootH) return [fy === bootH - 1 ? p.bootsCuff : vary(p.boots, x, y, z, 50), M]
  if (fy < bootH + shins) return [vary(p.skin, x, y, z, 51, 0.05), M]
  if (shins && fy === bootH + shins) return [p.trousersShade, M] // rolled hem
  const fromTop = d.legH - 1 - fy
  if (def.outfit === 'longcoat' && fromTop < 6) return fromTop === 5 ? [p.trim, SLOT.metal] : [vary(p.outer, x, y, z, 52), M]
  if (def.outfit === 'coat' && fromTop < 3) return [inner && front ? p.outerShade : vary(p.outer, x, y, z, 53), M]
  if (def.outfit === 'apron' && front && fromTop < 5) return fromTop === 4 ? [p.outerShade, M] : apronPx(p, x, y, z)
  return [inner ? p.trousersShade : vary(p.trousers, x, y, z, 54), M]
}

function buildLeg(def: PirateDef, d: PirateDims, left: boolean) {
  const v = new VoxelSet()
  const { legW, legD, legH, legZ0 } = d
  const x0 = left ? 0 : -legW
  for (let x = x0; x < x0 + legW; x++)
    for (let fy = 0; fy < legH; fy++)
      for (let z = legZ0; z < legZ0 + legD; z++) {
        const inner = left ? x === x0 : x === x0 + legW - 1
        const outer = left ? x === x0 + legW - 1 : x === x0
        const s: Surf = { x, y: fy, z, fy, front: z === legZ0 + legD - 1, back: z === legZ0, side: inner || outer, top: fy === legH - 1, cx: 0 }
        if (!s.front && !s.back && !s.side && !s.top && fy !== 0) continue
        const [c, slot] = legPx(def, d, s, inner)
        v.set(x, fy, z, c, slot)
      }
  // toe cap
  for (let x = x0; x < x0 + legW; x++) for (let fy = 0; fy < 2; fy++) v.set(x, fy, legZ0 + legD, fy === 1 ? def.palette.bootsCuff : def.palette.boots)
  return v
}

/* ───────────────────────────── assembly ───────────────────────────── */

export interface PirateModel {
  dims: PirateDims
  /** Head variants by eye state. */
  head: Record<Eyes, BufferGeometry>
  torso: BufferGeometry
  armL: BufferGeometry
  armR: BufferGeometry
  legL: BufferGeometry
  legR: BufferGeometry
  /** Pivot positions in metres, model space (unscaled): hips, neck, shoulders, hip joints. */
  pivots: {
    hip: [number, number, number]
    neck: [number, number, number]
    shoulderL: [number, number, number]
    shoulderR: [number, number, number]
    legL: [number, number, number]
    legR: [number, number, number]
  }
}

const geo = (v: VoxelSet, o: [number, number, number]) => partsToGeometry(v.mesh(PX, o))
const m = (o: [number, number, number]): [number, number, number] => [o[0] * PX, o[1] * PX, o[2] * PX]

export function buildPirate(def: PirateDef): PirateModel {
  const d = pirateDims(def)
  const hip: [number, number, number] = [0, d.legH, 0]
  const neck: [number, number, number] = [0, d.neck, 0]
  const armZ = d.armZ0 + d.armD / 2
  const shoulderY = d.neck - 1.5
  const shoulderR: [number, number, number] = [-d.W / 2 - d.armW / 2, shoulderY, armZ]
  const shoulderL: [number, number, number] = [d.W / 2 + d.armW / 2, shoulderY, armZ]
  const legZ = d.legZ0 + d.legD / 2
  const legL: [number, number, number] = [d.legW / 2, d.legH, legZ]
  const legR: [number, number, number] = [-d.legW / 2, d.legH, legZ]
  return {
    dims: d,
    head: {
      open: geo(buildHead(def, d, 'open'), neck),
      narrow: geo(buildHead(def, d, 'narrow'), neck),
      closed: geo(buildHead(def, d, 'closed'), neck),
    },
    torso: geo(buildTorso(def, d), hip),
    armL: geo(buildArm(def, d, false), shoulderL),
    armR: geo(buildArm(def, d, true), shoulderR),
    legL: geo(buildLeg(def, d, true), legL),
    legR: geo(buildLeg(def, d, false), legR),
    pivots: { hip: m(hip), neck: m(neck), shoulderL: m(shoulderL), shoulderR: m(shoulderR), legL: m(legL), legR: m(legR) },
  }
}

export function disposePirate(model: PirateModel) {
  for (const g of [...Object.values(model.head), model.torso, model.armL, model.armR, model.legL, model.legR]) g.dispose()
}
