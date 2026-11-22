import { useSyncExternalStore } from 'react'

/** Tiny external store (no extra dependency). Select primitives only. */
export function createStore<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      listeners.forEach((l) => l())
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

export type Mode = 'glide' | 'free'

/**
 * Decided once at startup and never changed mid-session (switching would rebuild the post chain
 * and shadow maps). Phones/tablets → low.
 */
export type Quality = 'high' | 'low'

export interface AppState {
  mode: Mode
  quality: Quality
  /** Glide rail progress, 0 (entrance) .. 1 (far end). */
  glide: number
  /** Bit i set = portal i is lit. */
  litMask: number
  /** Corridor torches on (the lever, phase 7). */
  torchesOn: boolean
  /** Shaders compiled and first frames drawn. */
  sceneReady: boolean
}

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
const coarse = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false)

/** ?lit=all lights every portal; ?lit=0,3,7 lights those. */
function initialLit(): number {
  const v = params.get('lit')
  if (!v) return 0
  if (v === 'all') return (1 << 18) - 1
  return v.split(',').reduce((m, s) => (Number.isInteger(+s) && +s >= 0 && +s < 18 ? m | (1 << +s) : m), 0)
}

/** ?quality=low|high overrides the device default (still fixed for the session). */
function initialQuality(): Quality {
  const q = params.get('quality')
  if (q === 'low' || q === 'high') return q
  return coarse ? 'low' : 'high'
}

export const appStore = createStore<AppState>({
  mode: 'glide',
  quality: initialQuality(),
  glide: 0,
  litMask: initialLit(),
  torchesOn: true,
  sceneReady: false,
})

export const isLit = (mask: number, id: number) => (mask & (1 << id)) !== 0

export function useApp<U>(selector: (s: AppState) => U): U {
  return useSyncExternalStore(appStore.subscribe, () => selector(appStore.get()))
}
