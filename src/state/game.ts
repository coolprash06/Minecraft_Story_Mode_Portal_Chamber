/**
 * Gameplay rules for the portal keys: take a flint from its frame, hold it, strike it on a portal.
 * Pure state + events; every animation lives in the scene components that listen for the events.
 */
import { playSfx } from '../audio/sfx'
import { flintById, HOTBAR_SLOTS } from '../config/items'
import { PORTAL_COLORS } from '../config/portals'
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
  if (target.kind === 'frame') takeFlint(target.flintId)
  else strikePortal(target.portalId)
}

/** Pending pickups: slots reserved for flints still in flight. */
const reserved = new Set<number>()

function takeFlint(flintId: string) {
  const s = appStore.get()
  const def = flintById(flintId)
  if (!def || s.taken.includes(flintId)) return
  const slot = s.hotbar.findIndex((id, i) => id === null && !reserved.has(i))
  if (slot < 0) {
    showToast('Your hotbar is full', 'warn')
    return
  }
  reserved.add(slot)
  appStore.set({ taken: [...s.taken, flintId], hover: null })
  const p = hall.portals[def.portalId].holders.itemFrame.position
  playSfx('pickup', { at: p, color: def.color })
  emitGame('pickup', { flintId, slot })
}

/** Called by the pickup animation when the flint reaches its hotbar slot. */
export function landPickup(flintId: string, slot: number) {
  reserved.delete(slot)
  appStore.set((s) => {
    if (s.hotbar.includes(flintId)) return {}
    const hotbar = [...s.hotbar]
    hotbar[slot] = flintId
    return { hotbar }
  })
}

function strikePortal(portalId: number) {
  const s = appStore.get()
  if (isLit(s.litMask, portalId)) return // lit: the warp comes in phase 6
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
