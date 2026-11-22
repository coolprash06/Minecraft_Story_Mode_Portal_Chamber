/**
 * The Hall of Portals, generated as voxel data plus a list of everything that is not a cube
 * (light sources, portal openings, chests, item frames). Deterministic: same hall every load.
 *
 * Cross-section (one side; the other mirrors it, s = ±1):
 *
 *   y=16  ceiling ───────────────────────────────
 *   y=15  beams (across at every pillar, along at x=±4)
 *   y=9   pale ledge at x=±5, full length (standing lanterns sit on it)
 *   y=8   coloured lintel band, x=±5..±7, over each recess
 *   y=0-7 recess x=±6, portal frame set into the back wall at x=±7
 *   y=-1  checkered floor
 *
 * Along z (towards −z), one bay every 9 blocks: a 2-block pillar, then a 7-block recess with the
 * portal frame (5 wide × 6 tall, 3 × 4 opening) centred in it and one free cell either side.
 */
import { PORTAL_ORDER, type PortalColor } from '../config/portals'
import { hash3 } from '../lib/random'
import { AIR, B, bandBlock, frameBlock } from './blocks'
import { VoxelGrid } from './grid'

export const HALL = {
  /** Interior cells x ∈ [−halfWidth, halfWidth]. */
  halfWidth: 5,
  /** Interior cells y ∈ [0, height − 1]; ceiling blocks at y = height. */
  height: 16,
  /** Back wall (behind the start) and far wall cells. */
  zBack: 2,
  zFar: -112,
  firstPillarZ: -6,
  bayPeriod: 9,
  /** Bays with a pillar; the first `portalBays` of them hold portals. */
  bays: 12,
  portalBays: 9,
  recessHeight: 8,
  ledgeY: 9,
  beamY: 15,
} as const

export type Side = -1 | 1
type V3 = [number, number, number]

export interface PortalInfo {
  id: number
  color: PortalColor
  side: Side
  bay: number
  /** Centre of the opening (world). */
  center: V3
  /** Unit normal pointing into the hall. */
  normal: V3
  width: number
  height: number
  /**
   * Where this portal's flint and steel can wait (config/items.ts picks one):
   *  • itemFrame: centre of the frame's back, flat on the recess back wall in the free cell on the
   *    far side of the portal frame, at eye level (visible from the aisle while approaching);
   *  • chest: on the recess floor in the free cell on the near side.
   */
  holders: { itemFrame: Placement; chest: Placement }
}

export interface Placement {
  position: V3
  /** Unit normal pointing into the hall. */
  normal: V3
}

/** Item-frame centre height: the glide camera's eye level. */
export const ITEM_FRAME_Y = 2.1

export interface TorchInfo {
  id: number
  /** Flame position (world): the top of the stick. */
  position: V3
  /** Where the stick meets the wall bracket. */
  base: V3
  /** Wall normal (into the hall). */
  normal: V3
  side: Side
}

export interface LanternInfo {
  id: number
  kind: 'hanging' | 'standing' | 'chandelier'
  /**
   * At rest (world). Hanging lantern: top of the lantern (where the chain ends). Chandelier: the
   * hub, where the chain ends. Standing lantern: the floor point it stands on.
   */
  position: V3
  /** Hanging lanterns and chandeliers: where the chain is anchored. Standing lanterns: null. */
  anchor: V3 | null
  /** Light intensity multiplier (the portrait lamps burn brighter). Default 1. */
  boost?: number
  /** Model scale for standing lanterns (the portrait lamps are smaller). Default 1. */
  scale?: number
}

export type ArmourFinish = 'iron' | 'gold' | 'diamond'
export type WeaponKind = 'sword' | 'axe' | 'spear' | 'bow'

export interface Decor {
  /** Armour stands on the floor in front of each pillar, facing the aisle. */
  armourStands: { position: V3; normal: V3; finish: ArmourFinish }[]
  /** Shield + crossed weapons mounted on each pillar face, between the two torches. */
  displays: { position: V3; normal: V3; weapon: WeaponKind; crest: number }[]
  /** Banners hung from a gold rod on the upper wall, centred over each recess. Position = rod centre. */
  banners: { position: V3; normal: V3; crest: number }[]
  /** Free-standing weapon racks (blind arches + entrance corners). Position = floor centre. */
  racks: { position: V3; normal: V3; seed: number }[]
  /** Royal carpet runner down the centre aisle. */
  carpet: { halfWidth: number; zStart: number; zEnd: number }
  /**
   * Side runners, one per portal (index = portal id): at a right angle from the main carpet to the
   * recess lip, centred on the portal. `xFrom` tucks just under the main carpet's edge.
   */
  runners: { portalId: number; side: Side; z: number; xFrom: number; xTo: number; halfWidth: number }[]
  /** A flat mat on the recess floor in front of each frame (index = portal id). Position = centre on the floor. */
  mats: { portalId: number; side: Side; position: V3; width: number; depth: number }[]
  /** The end-wall finale: the Founding King's portrait (canvas centre) and its nameplate (centre). */
  finale: { portrait: { position: V3; normal: V3 }; plaque: { position: V3; normal: V3 } }
}

export interface HallLayout {
  grid: VoxelGrid
  portals: PortalInfo[]
  torches: TorchInfo[]
  lanterns: LanternInfo[]
  decor: Decor
  /** Glide rail end points (camera z range). */
  rail: { zStart: number; zEnd: number; y: number }
  /** Portal id of each frame block, keyed by cell (for the frame glow). */
  frameOwner: Map<string, number>
}

export const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`

/** Z of the first (nearer) cell of pillar `bay`. Pillar cells are pz and pz − 1. */
export const pillarZ = (bay: number) => HALL.firstPillarZ - bay * HALL.bayPeriod

/** Wall torch geometry (shared with the torch model): stick length and outward tilt. */
export const TORCH = { length: 0.94, tilt: (22 * Math.PI) / 180 } as const

export function buildHall(): HallLayout {
  const W = HALL.halfWidth
  const H = HALL.height
  const grid = new VoxelGrid([-10, -1, HALL.zFar - 1], [10, H + 1, HALL.zBack + 1])

  // 1. Solid rock of stone brick, with a few cracked / darker bricks mixed in.
  grid.fill(-10, -1, HALL.zFar - 1, 10, H + 1, HALL.zBack + 1, (x, y, z) => {
    const r = hash3(x, y, z, 1)
    return r < 0.08 ? B.BRICK_CRACKED : r < 0.16 ? B.BRICK_DARK : B.BRICK
  })

  // 2. Carve the hall.
  grid.fill(-W, 0, HALL.zBack - 1, W, H - 1, HALL.zFar + 1, AIR)

  // 3. Checkered floor with scattered darker tiles (the recess floors get it too, see below).
  const floor = (x: number, _y: number, z: number) =>
    hash3(x, 0, z, 7) < 0.1 ? B.FLOOR_C : (x + z) & 1 ? B.FLOOR_A : B.FLOOR_B
  grid.fill(-9, -1, HALL.zBack, 9, -1, HALL.zFar, floor)

  // 4. Ceiling planks.
  grid.fill(-W, H, HALL.zBack, W, H, HALL.zFar, B.CEILING)

  // 5. Longitudinal beams just under the ceiling, and the pale ledge along both walls.
  for (const s of [-1, 1] as Side[]) {
    grid.fill(s * (W - 1), HALL.beamY, HALL.zBack - 1, s * (W - 1), HALL.beamY, HALL.zFar + 1, B.BEAM_Z)
    grid.fill(s * W, HALL.ledgeY, HALL.zBack - 1, s * W, HALL.ledgeY, HALL.zFar + 1, B.TRIM)
  }

  const portals: PortalInfo[] = []
  const torches: TorchInfo[] = []
  const lanterns: LanternInfo[] = []
  const decor: Decor = {
    armourStands: [],
    displays: [],
    banners: [],
    racks: [],
    carpet: { halfWidth: 0.75, zStart: HALL.zBack - 0.5, zEnd: HALL.zFar + 1.5 },
    runners: [],
    mats: [],
    finale: { portrait: { position: [0, 0, 0], normal: [0, 0, 1] }, plaque: { position: [0, 0, 0], normal: [0, 0, 1] } },
  }
  const frameOwner = new Map<string, number>()
  const FINISHES: ArmourFinish[] = ['iron', 'gold', 'diamond']
  const WEAPONS: WeaponKind[] = ['sword', 'axe', 'spear', 'bow']
  const sideIndex = { left: 0, right: 0 }

  for (let bay = 0; bay < HALL.bays; bay++) {
    const pz = pillarZ(bay)
    const pillarCenterZ = pz - 0.5

    // Cross beam over the aisle at every pillar.
    grid.fill(-W, HALL.beamY, pz, W, HALL.beamY, pz - 1, B.BEAM_X)

    for (const s of [-1, 1] as Side[]) {
      // Pillar: 2 deep along z, protrudes one block into the hall, pale stone with caps.
      grid.fill(s * W, 0, pz, s * W, H - 1, pz - 1, (_x, y) =>
        y === 0 || y === HALL.ledgeY || y === H - 1 ? B.PILLAR_CAP : B.PILLAR,
      )
      // Two wall torches on the pillar's inner face, leaning out into the hall.
      const face = s * (W - 0.5)
      for (const ty of [3.7, 11.4]) {
        const out = Math.sin(TORCH.tilt) * TORCH.length
        const up = Math.cos(TORCH.tilt) * TORCH.length
        torches.push({
          id: torches.length,
          base: [face, ty - up, pillarCenterZ],
          position: [face - s * out, ty, pillarCenterZ],
          normal: [-s, 0, 0],
          side: s,
        })
      }
      const n: V3 = [-s, 0, 0]
      // Armour stand guarding the pillar; shield + crossed weapons above it on the pillar face.
      decor.armourStands.push({ position: [s * 3.75, 0, pillarCenterZ], normal: n, finish: FINISHES[(bay + (s > 0 ? 1 : 0)) % 3] })
      decor.displays.push({ position: [face - s * 0.04, 7.1, pillarCenterZ], normal: n, weapon: WEAPONS[(bay + (s > 0 ? 2 : 0)) % 4], crest: (bay * 2 + (s > 0 ? 1 : 0)) % 6 })
      // Banner on the upper wall, centred over the recess.
      decor.banners.push({ position: [s * (W + 0.5) - s * 0.06, 14.55, pz - 5], normal: n, crest: (bay + (s > 0 ? 3 : 0)) % 6 })

      const z0 = pz - 2 // first recess cell (nearest the entrance)
      const z1 = pz - 8 // last recess cell
      if (bay < HALL.portalBays) {
        const color = PORTAL_ORDER[s < 0 ? 'left' : 'right'][s < 0 ? sideIndex.left++ : sideIndex.right++]
        // Recess one block deep, then the frame layer at x = ±7, set into the back wall.
        grid.fill(s * (W + 1), 0, z0, s * (W + 2), HALL.recessHeight - 1, z1, AIR)
        grid.fill(s * (W + 1), -1, z0, s * (W + 2), -1, z1, floor)
        // Coloured lintel: overhangs the hall by one block, so its underside catches the glow.
        grid.fill(s * W, HALL.recessHeight, z0, s * (W + 2), HALL.recessHeight, z1, bandBlock(color))
        // Frame layer: brick around the frame, frame blocks, open 3 × 4 centre.
        grid.fill(s * (W + 2), 0, z0, s * (W + 2), HALL.recessHeight - 1, z1, B.BRICK)
        const fz0 = pz - 3
        const fz1 = pz - 7
        const fc = frameBlock(color)
        grid.fill(s * (W + 2), 0, fz0, s * (W + 2), 5, fz1, (_x, y, z) => (y === 0 || y === 5 || z === fz0 || z === fz1 ? fc : AIR))
        for (let y = 0; y <= 5; y++) for (let z = fz1; z <= fz0; z++) frameOwner.set(cellKey(s * (W + 2), y, z), portals.length)

        const cz = pz - 5
        // Side runner from the main carpet to the recess lip (x = ±5.5), then a mat on the recess
        // floor, as wide as the opening, stopping just short of the frame's sill.
        decor.runners.push({ portalId: portals.length, side: s, z: cz, xFrom: s * (decor.carpet.halfWidth - 0.05), xTo: s * (W + 0.5), halfWidth: 0.5 })
        decor.mats.push({ portalId: portals.length, side: s, position: [s * (W + 0.95), 0, cz], width: 3, depth: 0.9 })
        portals.push({
          id: portals.length,
          color,
          side: s,
          bay,
          center: [s * (W + 2), 3, cz],
          normal: [-s, 0, 0],
          width: 3,
          height: 4,
          holders: {
            itemFrame: { position: [s * (W + 1.5), ITEM_FRAME_Y, z1], normal: [-s, 0, 0] },
            chest: { position: [s * (W + 1), 0, z0], normal: [-s, 0, 0] },
          },
        })
      } else {
        // Beyond the portals the rhythm continues with shallow blind arches into the fog.
        grid.fill(s * (W + 1), 0, z0, s * (W + 1), HALL.recessHeight - 1, z1, AIR)
        grid.fill(s * (W + 1), -1, z0, s * (W + 1), -1, z1, floor)
        grid.fill(s * W, HALL.recessHeight, z0, s * (W + 1), HALL.recessHeight, z1, B.TRIM)
        decor.racks.push({ position: [s * (W + 0.85), 0, pz - 5], normal: [-s, 0, 0], seed: bay * 2 + (s > 0 ? 1 : 0) })
      }
    }

    // A chandelier over the centre aisle from every cross beam, a pair of hanging lanterns over the
    // side aisles on every other bay, and a standing lantern on the ledge every third bay.
    const beamBottom = HALL.beamY
    lanterns.push({ id: lanterns.length, kind: 'chandelier', position: [0, beamBottom - 5.4, pillarCenterZ], anchor: [0, beamBottom, pillarCenterZ] })
    if (bay % 2 === 1) {
      for (const s of [-1, 1]) {
        lanterns.push({ id: lanterns.length, kind: 'hanging', position: [s * 2.4, beamBottom - 2.6, pillarCenterZ], anchor: [s * 2.4, beamBottom, pillarCenterZ] })
      }
    }
    if (bay % 3 === 1) {
      const s = bay % 2 === 0 ? 1 : -1
      lanterns.push({ id: lanterns.length, kind: 'standing', position: [s * W, HALL.ledgeY + 1, pz - 2], anchor: null })
    }
  }

  // Standing lanterns on the floor at the entrance.
  for (const s of [-1, 1]) {
    lanterns.push({ id: lanterns.length, kind: 'standing', position: [s * 2.2, 0, 0.4], anchor: null })
    // weapon racks against the back wall, either side of the entrance
    decor.racks.push({ position: [s * 3.6, 0, HALL.zBack - 0.5 - 0.45], normal: [0, 0, -1], seed: 20 + (s > 0 ? 1 : 0) })
  }

  // The finale on the far wall (face at z = zFar + ½): the Founding King's portrait, its
  //    nameplate, a banner and an armour stand either side, and two lamps on stone pedestals in
  //    front, close to the floor, throwing their light up across the canvas.
  const wallZ = HALL.zFar + 0.5
  decor.finale.portrait.position = [0, 3.05, wallZ]
  decor.finale.plaque.position = [0, 1.02, wallZ]
  for (const s of [-1, 1] as Side[]) {
    decor.banners.push({ position: [s * 3.45, 5.95, wallZ + 0.06], normal: [0, 0, 1], crest: s < 0 ? 0 : 2 })
    const n = Math.hypot(0.3, 1)
    decor.armourStands.push({ position: [s * 3.05, 0, wallZ + 0.6], normal: [(-s * 0.3) / n, 0, 1 / n], finish: 'gold' })
    grid.set(s * 2, 0, wallZ + 1.5, B.PILLAR_CAP)
    lanterns.push({ id: lanterns.length, kind: 'standing', position: [s * 2, 1, wallZ + 1.5], anchor: null, boost: 1.8, scale: 0.62 })
  }

  return {
    grid,
    portals,
    torches,
    lanterns,
    decor,
    // the glide stops ~4 blocks short of the far wall, so the portrait fills the view
    rail: { zStart: 0.5, zEnd: wallZ + 4.2, y: 2.1 },
    frameOwner,
  }
}

/** Built once; every component reads the same instance. */
export const hall = buildHall()
