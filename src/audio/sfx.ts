/**
 * Sound hook points. Gameplay calls `playSfx(name, detail)` at the right moments; Phase 5 plugs a
 * synthesised WebAudio player in with `setSfxPlayer`. Until then this is a no-op (logged with ?debug).
 */
export type SfxName = 'pickup' | 'spark' | 'ignite' | 'fizzle'

export interface SfxDetail {
  /** World position of the sound, for panning later. */
  at?: [number, number, number]
  /** Tint / pitch hint: the flint or portal colour. */
  color?: string
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
