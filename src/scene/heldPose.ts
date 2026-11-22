/** The held item's camera-space rest pose (HeldItem), shared with the flint's return flight (ItemFrames). */
import { Euler, Vector3 } from 'three'

export const HELD_REST = new Vector3(0.27, -0.2, -0.6)
export const HELD_REST_ROT = new Euler(0.12, -0.45, 0.28)
export const HELD_SCALE = 0.3
