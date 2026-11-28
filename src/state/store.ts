import { useSyncExternalStore } from 'react'
import { DEV_FLINTS, FLINTS, flintById, HOTBAR_SLOTS } from '../config/items'

/** Tiny external store (no extra dependency). Select primitives (or stable references) only. */
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
 * Free Roam pointer lock: 'locked' (playing), 'pending' (requested), 'released' (paused / not
 * started), 'refused' (the browser said no: usually the ~1 s cool-down after Esc).
 */
export type FreeLock = 'locked' | 'pending' | 'released' | 'refused'

/**
 * Decided once at startup and never changed mid-session (switching would rebuild the post chain
 * and shadow maps). Phones/tablets → low.
 */
export type Quality = 'high' | 'low'

/** What the pointer (later: the crosshair) is over. */
export type Hover = { kind: 'frame'; flintId: string } | { kind: 'portal'; portalId: number } | null

/**
 * Portal entry, step by step (never saved: a reload is always back in the hall):
 *  hall → entering (walk + jump, or the reduced-motion fade) → warp (warp screen) → dimension
 *  → returning (back on the rail in front of the portal) → hall. Esc while walking cancels
 *  (entering → hall).
 */
export type Journey = 'hall' | 'entering' | 'warp' | 'dimension' | 'returning'

export interface Toast {
  text: string
  tone: 'info' | 'warn'
  /** Increments per toast, so the same text twice still re-triggers. */
  key: number
}

export interface AppState {
  /** Glide (default on every load, never saved) or Free Roam. */
  mode: Mode
  freeLock: FreeLock
  quality: Quality
  /** Glide rail progress, 0 (entrance) .. 1 (far end). */
  glide: number
  /** Bit i set = portal i is lit. */
  litMask: number
  /** Corridor torches on (the lever, phase 7). */
  torchesOn: boolean
  /** Shaders compiled and first frames drawn. */
  sceneReady: boolean
  /** Flint ids taken from their item frames (the frame is empty from the moment it's clicked). */
  taken: string[]
  /** Hotbar contents: flint id per slot (filled when the pickup flight lands). */
  hotbar: (string | null)[]
  /** Selected (held) hotbar slot, −1 = empty hand. */
  selected: number
  hover: Hover
  toast: Toast | null
  journey: Journey
  /** The portal being entered / visited (−1 in the hall). */
  journeyPortal: number
  /** Full-screen veil over the canvas: opaque while the dimension side is showing. */
  veil: boolean
  /** Veil fade time (ms) for the next change. */
  veilMs: number
}

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
const coarse = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false)

const portalParam = (k: string) => {
  const v = params.get(k)
  const n = v === null ? NaN : v === '' ? 0 : Number(v)
  return Number.isInteger(n) && n >= 0 && n < 18 ? n : -1
}
/** ?at=0: start on the rail in front of portal 0, facing it, already lit (GlideRig reads it). */
export const DEBUG_AT = portalParam('at')
/** ?dim=0: start on portal 0's dimension screen (Return puts you on the rail in front of it, lit). */
export const DEBUG_DIM = portalParam('dim')
/** ?mode=free: start in Free Roam (behind the "click to play" menu). Not on touch devices. */
export const DEBUG_FREE = params.get('mode') === 'free' && !coarse

/** ?lit=all lights every portal; ?lit=0,3,7 lights those. ?at / ?dim light their portal too. Debug only: never saved. */
function debugLit(): number {
  let m = 0
  for (const id of [DEBUG_AT, DEBUG_DIM]) if (id >= 0) m |= 1 << id
  const v = params.get('lit')
  if (!v) return m
  if (v === 'all') return (1 << 18) - 1
  return v.split(',').reduce((m, s) => (Number.isInteger(+s) && +s >= 0 && +s < 18 ? m | (1 << +s) : m), m)
}
export const DEBUG_LIT = debugLit()

/** ?quality=low|high overrides the device default (still fixed for the session). */
function initialQuality(): Quality {
  const q = params.get('quality')
  if (q === 'low' || q === 'high') return q
  return coarse ? 'low' : 'high'
}

/* ───────────────────────────── persistence (sessionStorage) ───────────────────────────── */

const SAVE_KEY = 'hall-of-portals:v1'
interface Saved {
  taken: string[]
  hotbar: (string | null)[]
  selected: number
  lit: number
}

const storage = {
  get(): string | null {
    try {
      return sessionStorage.getItem(SAVE_KEY)
    } catch {
      return null
    }
  },
  set(v: string) {
    try {
      sessionStorage.setItem(SAVE_KEY, v)
    } catch {
      /* private mode / blocked storage: the session just isn't saved */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(SAVE_KEY)
    } catch {
      /* ignore */
    }
  },
}

/** ?reset clears the saved session, then drops itself from the URL so a reload keeps new progress. */
if (typeof window !== 'undefined' && params.has('reset')) {
  storage.clear()
  const url = new URL(window.location.href)
  url.searchParams.delete('reset')
  window.history.replaceState(null, '', url)
}

const REAL = new Set(FLINTS.map((f) => f.id))

function load(): Saved {
  const empty: Saved = { taken: [], hotbar: Array(HOTBAR_SLOTS).fill(null), selected: -1, lit: 0 }
  const raw = storage.get()
  if (!raw) return empty
  try {
    const s = JSON.parse(raw) as Partial<Saved>
    const taken = Array.isArray(s.taken) ? s.taken.filter((id) => REAL.has(id)) : []
    const hotbar = Array.from({ length: HOTBAR_SLOTS }, (_, i) => {
      const id = Array.isArray(s.hotbar) ? s.hotbar[i] : null
      return typeof id === 'string' && REAL.has(id) ? id : null
    })
    // a flint taken mid-flight (reload during the animation) still lands in the hotbar
    for (const id of taken)
      if (!hotbar.includes(id)) {
        const free = hotbar.indexOf(null)
        if (free >= 0) hotbar[free] = id
      }
    const selected = Number.isInteger(s.selected) && s.selected! >= -1 && s.selected! < HOTBAR_SLOTS ? s.selected! : -1
    const lit = Number.isInteger(s.lit) ? s.lit! & ((1 << 18) - 1) : 0
    return { taken, hotbar, selected, lit }
  } catch {
    return empty
  }
}

const saved = load()

/** ?give=crimson,azure puts those flints straight into free hotbar slots (dev: test the mismatch path). */
function applyGive(hotbar: (string | null)[]) {
  const ids = params.get('give')?.split(',') ?? []
  const devIds = new Set(DEV_FLINTS.map((f) => f.id))
  for (const id of ids) {
    if (!flintById(id) || hotbar.includes(id)) continue
    // real flints given this way also count as taken (their frame empties)
    if (!devIds.has(id) && !saved.taken.includes(id)) saved.taken.push(id)
    const free = hotbar.indexOf(null)
    if (free >= 0) hotbar[free] = id
  }
  return hotbar
}

export const appStore = createStore<AppState>({
  mode: DEBUG_FREE ? 'free' : 'glide',
  freeLock: 'released',
  quality: initialQuality(),
  glide: 0,
  litMask: saved.lit | DEBUG_LIT,
  torchesOn: true,
  sceneReady: false,
  taken: saved.taken,
  hotbar: applyGive(saved.hotbar),
  selected: saved.selected,
  hover: null,
  toast: null,
  journey: DEBUG_DIM >= 0 ? 'dimension' : 'hall',
  journeyPortal: DEBUG_DIM,
  veil: DEBUG_DIM >= 0,
  veilMs: 0,
})

// Save only when the persisted fields change (the store also updates every frame for `glide`).
{
  let last = ''
  let prev: AppState | null = null
  appStore.subscribe(() => {
    const s = appStore.get()
    if (prev && prev.taken === s.taken && prev.hotbar === s.hotbar && prev.selected === s.selected && prev.litMask === s.litMask) return
    prev = s
    // dev flints from ?give are never saved (nor is holding one)
    const hotbar = s.hotbar.map((id) => (id && REAL.has(id) ? id : null))
    const data: Saved = {
      taken: s.taken,
      hotbar,
      selected: s.selected >= 0 && hotbar[s.selected] ? s.selected : -1,
      // ?lit debug bits are never saved
      lit: s.litMask & ~DEBUG_LIT,
    }
    const json = JSON.stringify(data)
    if (json !== last) {
      last = json
      storage.set(json)
    }
  })
}

export const isLit = (mask: number, id: number) => (mask & (1 << id)) !== 0

export function useApp<U>(selector: (s: AppState) => U): U {
  return useSyncExternalStore(appStore.subscribe, () => selector(appStore.get()))
}
