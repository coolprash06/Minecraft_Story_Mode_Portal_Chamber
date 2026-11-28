/**
 * Sound hook points. Gameplay calls `playSfx(name, detail)` at the right moments; Phase 5 plugs a
 * synthesised WebAudio player in with `setSfxPlayer`. Until then this is a no-op (logged with ?debug).
 */
export type SfxName =
  | 'pickup'
  | 'spark'
  | 'ignite'
  | 'fizzle'
  /** Clicked a lit portal: leaving the rail. */
  | 'enter'
  /** One footstep (the scripted walk, or Free Roam; `surface` says what's underfoot). */
  | 'step'
  /** Take-off: into the portal, or a Free Roam jump. */
  | 'jump'
  /** Free Roam: feet back on the ground after a jump or a drop (`impact` = fall speed, m/s). */
  | 'land'
  /** Rising rush of air (soft while walking, big on the jump). */
  | 'whoosh'
  /** Crossing the surface: the warp screen begins. */
  | 'warp'
  /** Arriving in the dimension. */
  | 'arrive'
  /** Stepping back out of a dimension into the hall. */
  | 'exitDimension'
  /** A flint flies back into its item frame. */
  | 'return'
  /** A lit portal goes dark (its flint was returned). */
  | 'extinguish'
  /** Esc: turned back before the jump. */
  | 'cancel'

export interface SfxDetail {
  /** World position of the sound, for panning later. */
  at?: [number, number, number]
  /** Tint / pitch hint: the flint or portal colour. */
  color?: string
  /** Footsteps / landing: the surface underfoot ('stone', 'carpet'). */
  surface?: string
  /** Landing: fall speed (m/s). */
  impact?: number
}

type Player = (name: SfxName, detail: SfxDetail) => void

const DEBUG = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')
let player: Player | null = null

export function setSfxPlayer(p: Player | null) {
  player = p
}

export function playSfx(name: SfxName, detail: SfxDetail = {}) {
  if (DEBUG) console.debug(`[sfx] ${name}`, detail)
  player?.(name, detail)
}

/**
 * Continuous portal hum (phase 5). `level` 0..1 is loudness, `pitch` 0..1 rises during the entry
 * (the Nether project's hum went up ×2.5 with its filters opening); `seconds` is the glide time.
 */
type HumPlayer = (portalId: number, level: number, pitch: number, seconds: number) => void
let hum: HumPlayer | null = null
export function setHumPlayer(p: HumPlayer | null) {
  hum = p
}
export function setHum(portalId: number, level: number, pitch: number, seconds = 0.4) {
  if (DEBUG) console.debug(`[sfx] hum #${portalId} level ${level} pitch ${pitch} over ${seconds}s`)
  hum?.(portalId, level, pitch, seconds)
}
