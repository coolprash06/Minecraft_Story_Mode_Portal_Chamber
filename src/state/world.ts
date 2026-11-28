/**
 * The 3D worlds behind portals (Mission 1's ship for now): their lazy chunks and loading state.
 *
 *  • Each world is its own chunk (`import()`), so none of its code or GPU state exists in the hall.
 *    The chunk is prefetched once the hall is ready and the browser is idle (download only: nothing
 *    is built), so the warp screen rarely waits for the network.
 *  • `worldLoad` is the loading state the warp screen reads every frame (a plain object, so nothing
 *    re-renders): progress 0..1, the current stage's line, ready (the first frames are drawn and
 *    every program is compiled) and failed (the warp screen then falls back to the placeholder).
 */
import { COARSE_POINTER } from '../lib/device'

export const worldLoad = {
  progress: 0,
  stage: '',
  ready: false,
  failed: false,
}

// ?debug: a handle for flow tests
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) Object.assign(window, { __world: worldLoad })

export function resetWorldLoad() {
  worldLoad.progress = 0
  worldLoad.stage = ''
  worldLoad.ready = false
  worldLoad.failed = false
}

/** Raise the progress (never lowers it) and name the stage. */
export function reportWorldLoad(progress: number, stage?: string) {
  worldLoad.progress = Math.max(worldLoad.progress, Math.min(1, progress))
  if (stage) worldLoad.stage = stage
}

type ShipModule = typeof import('../ship/ShipWorld')
let ship: Promise<ShipModule> | null = null

/** The ship world's chunk (cached; a failed download is retried on the next call). */
export function loadShip(): Promise<ShipModule> {
  if (!ship)
    ship = import('../ship/ShipWorld').catch((e: unknown) => {
      ship = null
      throw e
    })
  return ship
}

/** Download the world chunks in the background once the hall is up (never on touch devices). */
export function prefetchWorlds() {
  if (COARSE_POINTER || typeof window === 'undefined') return
  const idle = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 300))
  idle(() => {
    loadShip().catch(() => {
      /* retried when the portal is entered */
    })
  })
}
