/**
 * Mission 1's ship world: shared layout numbers, the sky palette and the sun.
 *
 * Ship coordinates (also the world's: the ship lies still in stage 1; the sway arrives with the
 * real ship): 1 unit = 1 block = 1 m, x across the ship (port −, starboard +), z along it (bow at
 * z = 0, stern at z = 44), y up. Walking surfaces of the real ship (stage 2): hold y 1, lower deck
 * y 5, main deck y 9, quarterdeck y 13, crow's nest y 31. The sea is at y 6.
 *
 * Stage 1 has a temporary flat deck (a plain hull box at the main deck's height) with the blue
 * deck portal standing on its forward part, facing aft.
 */
import { Color, Vector3 } from 'three'

export type V3 = [number, number, number]

/** Mean sea level. */
export const SEA_Y = 6

/** The temporary deck (stage 1): a hull box with a plank top and low bulwarks. */
export const DECK = {
  /** Walking surface. */
  y: 9,
  halfW: 6.5,
  z0: 0,
  z1: 44,
  /** Hull bottom (under water). */
  bottom: 3.5,
  /** Bulwark height above the deck, its thickness, and its collider height (no jumping overboard). */
  railH: 1,
  railT: 0.25,
  railCollide: 1.6,
} as const

/**
 * The deck portal: a free-standing 5 × 6 frame (3 × 4 opening) in the hall's frame blocks, in the
 * cells x −2..2, y 9..14 (on the deck), z = 11; the opening faces aft (+z) and fore.
 */
export const PORTAL = {
  z: 11,
  /** Frame cell rows: the sill is y 9, the lintel y 14. */
  y0: 9,
  y1: 14,
  halfW: 2,
  center: [0, 12, 11] as V3,
  width: 3,
  height: 4,
} as const

/** Where you arrive (feet), facing aft down the deck, just out of the portal. */
export const SPAWN = { x: 0, z: 13.6, yaw: Math.PI } as const

/**
 * The island (where the ruined exit portal will stand, later): about 220 m off the port quarter,
 * so as you arrive (facing aft) it is in view to the right of the deck. Voxels of 1 m; the coast
 * distance map covers ±HALF m around its centre.
 */
export const ISLAND = { x: -130, z: 190, half: 64 } as const

/* ───────────────────────────── sky and sun (bright tropical day) ───────────────────────────── */

/** Towards the sun: high (≈ 63°), behind you as you arrive (fore and a little to port). */
export const SUN_DIR = new Vector3(-0.3, 1.6, -0.75).normalize()

const lin = (hex: string) => new Color(hex)

/** Linear colours (Color.set converts from sRGB). */
export const SKY = {
  zenith: lin('#2c6fd3'),
  upper: lin('#5aa5ec'),
  horizon: lin('#cbe8f6'),
  sun: new Color(1.0, 0.95, 0.84),
  cloud: lin('#f4f8ff'),
  cloudShade: lin('#c9d6e8'),
  /** Clouds: a flat voxel layer this high above the sea (m). */
  cloudHeight: 170,
} as const

export const SEA = {
  deep: lin('#0a5a85'),
  mid: lin('#148db0'),
  shallow: lin('#2fc4bd'),
  shore: lin('#8fe2cc'),
  foam: lin('#effbff'),
} as const

/** Haze towards the horizon (FogExp2): ~93 % clear at the island, the sea's edge fully hazed. */
export const FOG_DENSITY = 0.0011

/** sRGB hex of the horizon (the canvas clear colour and the scene fog). */
export const HORIZON_HEX = '#cbe8f6'

/** Camera far plane: past the sea's edge. */
export const FAR = 2600
