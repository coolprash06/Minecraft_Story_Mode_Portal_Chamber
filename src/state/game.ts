/**
 * Gameplay rules for the portal keys: take a flint from its frame, hold it, strike it on a portal.
 * Pure state + events; every animation lives in the scene components that listen for the events.
 */
import { playSfx, setHum } from '../audio/sfx'
import { flintById, HOTBAR_SLOTS } from '../config/items'
import { COARSE_POINTER } from '../lib/device'
import { PORTAL_COLORS } from '../config/portals'
import { portalFx } from '../gfx/portalFx'
import { hall } from '../world/layout'
import { emitGame } from './events'
import { appStore, isLit, type Hover } from './store'

let toastKey = 0
export function showToast(text: string, tone: 'info' | 'warn' = 'info') {
  appStore.set({ toast: { text, tone, key: ++toastKey } })
}

/** The flint in the selected slot, if any. */
export function heldFlint() {
  const s = appStore.get()
  return s.selected >= 0 ? flintById(s.hotbar[s.selected]) : undefined
}

/** Select a hotbar slot; selecting the held slot again empties the hand. */
export function selectSlot(i: number) {
  if (i < 0 || i >= HOTBAR_SLOTS) return
  appStore.set((s) => ({ selected: s.selected === i ? -1 : i }))
}

export function interact(target: Hover) {
  if (!target) return
  if (target.kind === 'frame') {
    if (appStore.get().taken.includes(target.flintId)) returnFlint(target.flintId)
    else takeFlint(target.flintId)
  } else strikePortal(target.portalId)
}

/** Pending pickups: slots reserved for flints still in flight. */
const reserved = new Set<number>()
/** Flints flying between a frame and the player (either way): their frame is not interactive. */
const flying = new Set<string>()
export const isFlying = (flintId: string) => flying.has(flintId)

/**
 * What clicking an empty frame would do right now (the hover prompt uses the same answer):
 * 'return' (holding its flint), 'wrong' (holding another flint), 'hold' (its flint is in the
 * hotbar but not held), or null (nothing to say: e.g. still in flight).
 */
export function returnCheck(flintId: string): 'return' | 'wrong' | 'hold' | null {
  const s = appStore.get()
  if (!s.taken.includes(flintId) || flying.has(flintId)) return null
  const held = heldFlint()
  if (held?.id === flintId) return 'return'
  if (held) return 'wrong'
  return s.hotbar.includes(flintId) ? 'hold' : null
}

/**
 * Put the held flint back in its own frame. It leaves the hotbar at once (the hand empties) and
 * flies back; if its portal was lit, the portal goes dark at the same moment.
 */
function returnFlint(flintId: string) {
  const s = appStore.get()
  const def = flintById(flintId)
  if (!def || s.journey !== 'hall') return
  const check = returnCheck(flintId)
  if (check === 'wrong') return showToast("This isn't its frame", 'warn')
  if (check === 'hold') return showToast(`Hold ${def.name} to return it`, 'warn')
  if (check !== 'return') return
  const slot = s.selected
  const hotbar = [...s.hotbar]
  hotbar[slot] = null
  const portalId = def.portalId
  const wasLit = isLit(s.litMask, portalId)
  flying.add(flintId)
  appStore.set({
    hotbar,
    selected: -1,
    taken: s.taken.filter((id) => id !== flintId),
    litMask: s.litMask & ~(1 << portalId),
    hover: null,
  })
  const p = hall.portals[portalId]
  playSfx('return', { at: p.holders[def.holder].position, color: def.color })
  emitGame('returnFlint', { flintId, slot })
  if (wasLit) {
    playSfx('extinguish', { at: p.center, color: PORTAL_COLORS[p.color] })
    setHum(portalId, 0, 0, 1.2)
    emitGame('extinguish', { portalId })
  }
}

/** Called by the return animation when the flint is back on its frame. */
export function landReturn(flintId: string) {
  flying.delete(flintId)
}

function takeFlint(flintId: string) {
  const s = appStore.get()
  const def = flintById(flintId)
  if (!def || s.taken.includes(flintId) || flying.has(flintId)) return
  const slot = s.hotbar.findIndex((id, i) => id === null && !reserved.has(i))
  if (slot < 0) {
    showToast('Your hotbar is full', 'warn')
    return
  }
  reserved.add(slot)
  flying.add(flintId)
  appStore.set({ taken: [...s.taken, flintId], hover: null })
  const p = hall.portals[def.portalId].holders.itemFrame.position
  playSfx('pickup', { at: p, color: def.color })
  emitGame('pickup', { flintId, slot })
}

/** Called by the pickup animation when the flint reaches its hotbar slot. */
export function landPickup(flintId: string, slot: number) {
  reserved.delete(slot)
  flying.delete(flintId)
  appStore.set((s) => {
    if (s.hotbar.includes(flintId)) return {}
    const hotbar = [...s.hotbar]
    hotbar[slot] = flintId
    return { hotbar }
  })
}

function strikePortal(portalId: number) {
  const s = appStore.get()
  if (isLit(s.litMask, portalId)) {
    // Free Roam: you jump in yourself (the prompt says so); a click does nothing
    if (s.mode === 'glide') enterPortal(portalId, 'glide')
    return
  }
  const flint = heldFlint()
  const portal = hall.portals[portalId]
  if (!flint) {
    showToast('You need a flint and steel', 'warn')
    return
  }
  emitGame('strike', { portalId })
  const at: [number, number, number] = [portal.center[0], 1, portal.center[2]]
  playSfx('spark', { at, color: flint.color })
  if (flint.portalId !== portalId) {
    playSfx('fizzle', { at, color: flint.color })
    showToast("This flint doesn't match", 'warn')
    emitGame('fizzle', { portalId })
    return
  }
  // Lit from this frame on: the light field starts fading the portal's light pool in, and the
  // surface fill / flash / shake run in PortalFx.
  appStore.set({ litMask: s.litMask | (1 << portalId), hover: null })
  playSfx('ignite', { at: portal.center, color: PORTAL_COLORS[portal.color] })
  emitGame('ignite', { portalId })
}

/* ───────────────────────────── entering a portal ───────────────────────────── */

/**
 * Enter a lit portal. From Glide (a click): leave the rail, walk the runner and jump in. From Free
 * Roam (later: the player's head enters the opening after a SPACE jump): only the crossing runs.
 * EntryRig plays the camera side, the Journey UI the screens.
 */
export function enterPortal(portalId: number, from: 'glide' | 'free') {
  const s = appStore.get()
  if (s.journey !== 'hall' || !s.sceneReady || !isLit(s.litMask, portalId)) return
  // still igniting: wait until the surface has filled
  if (portalFx.fill[portalId] < 0.98) return
  appStore.set({ journey: 'entering', journeyPortal: portalId, hover: null })
  const p = hall.portals[portalId]
  playSfx('enter', { at: p.center, color: PORTAL_COLORS[p.color] })
  setHum(portalId, 1, 1, from === 'glide' ? 4 : 0.6)
  emitGame('enter', { portalId, from })
}

/** Esc while walking (EntryRig decides whether it is still possible). */
export function cancelEntry() {
  const s = appStore.get()
  if (s.journey !== 'entering') return
  playSfx('cancel')
  emitGame('cancelEntry', { portalId: s.journeyPortal })
}

/** The camera has crossed the surface (or the reduced-motion fade is complete). */
export function crossInto(direct = false) {
  const s = appStore.get()
  if (s.journey !== 'entering') return
  playSfx('warp', { color: PORTAL_COLORS[hall.portals[s.journeyPortal].color] })
  setHum(s.journeyPortal, 0, 1, 0.8)
  appStore.set({ journey: direct ? 'dimension' : 'warp', veil: true, veilMs: direct ? 900 : 0 })
  if (direct) playSfx('arrive')
}

/** The warp screen has finished. */
export function arriveInDimension() {
  if (appStore.get().journey !== 'warp') return
  playSfx('arrive')
  appStore.set({ journey: 'dimension' })
}

/** "Return to Corridor" (or Esc on the dimension screen). */
export function returnToCorridor() {
  const s = appStore.get()
  if (s.journey !== 'dimension' || !s.sceneReady) return
  // Free Roam: the button's click is the gesture that re-locks the mouse (Esc can't; then the
  // pause menu's Resume does it)
  if (s.mode === 'free') requestFreeLock()
  playSfx('exitDimension')
  appStore.set({ journey: 'returning' })
  emitGame('return', { portalId: s.journeyPortal })
}

/** EntryRig: control is back with the rail. */
export function backInHall() {
  const s = appStore.get()
  if (s.journeyPortal >= 0) setHum(s.journeyPortal, 0.35, 0, 1.2)
  appStore.set({ journey: 'hall', journeyPortal: -1, veil: false })
}

/* ───────────────────────────── Free Roam ───────────────────────────── */

/** Can the mode be switched right now? (in the hall, scene ready, not on a touch device) */
export const canSwitchMode = () => {
  const s = appStore.get()
  return !COARSE_POINTER && s.sceneReady && s.journey === 'hall'
}

/** Glide ⇄ Free Roam. Call from a key / click handler: entering Free Roam takes the pointer lock. */
export function setMode(mode: 'glide' | 'free') {
  if (!canSwitchMode() || appStore.get().mode === mode) return
  appStore.set({ mode, hover: null })
  emitGame('mode', { mode })
}

export const toggleMode = () => setMode(appStore.get().mode === 'glide' ? 'free' : 'glide')

/** Take the pointer lock for Free Roam (inside a user gesture). */
export function requestFreeLock() {
  if (appStore.get().mode !== 'free') return
  emitGame('requestLock', {})
}

/** Pause menu: back to the entrance, still in Free Roam. */
export function returnToEntrance() {
  if (appStore.get().mode !== 'free' || appStore.get().journey !== 'hall') return
  emitGame('toEntrance', {})
}
