/**
 * One-shot gameplay events (game logic → scene effects). State lives in the store; these only say
 * "play this animation now", so nothing re-renders for them.
 */
export interface GameEvents {
  /** A flint left its frame; it flies into hotbar `slot`. */
  pickup: { flintId: string; slot: number }
  /** The held flint was struck (any outcome): swing the held item. */
  strike: { portalId: number }
  /** Correct flint: light the portal. */
  ignite: { portalId: number }
  /** Wrong flint: sparks die in grey smoke. */
  fizzle: { portalId: number }
  /** The held flint flies from the hand back into its frame (it already left hotbar `slot`). */
  returnFlint: { flintId: string; slot: number }
  /** Its flint was returned while the portal was lit: drain the surface, smoke, dim. */
  extinguish: { portalId: number }
  /**
   * Start entering a lit portal. 'glide': leave the rail, walk the runner, jump in.
   * 'free' (Free Roam, later): the player jumped into the opening themselves; only the crossing runs.
   */
  enter: { portalId: number; from: 'glide' | 'free' }
  /** Esc while walking: glide back onto the rail. */
  cancelEntry: { portalId: number }
  /** "Return to Corridor": back in the hall in front of the portal (on the rail, or on its mat in Free Roam). */
  return: { portalId: number }
  /** Switch Glide ⇄ Free Roam (FreeRig / GlideRig hand the camera over). Fired inside the user gesture. */
  mode: { mode: 'glide' | 'free' }
  /** Free Roam: take the pointer lock (must be fired inside a user gesture). */
  requestLock: Record<string, never>
  /** Free Roam: back to the entrance (the pause menu's fade covers the jump). */
  toEntrance: Record<string, never>
}

type Handler<K extends keyof GameEvents> = (e: GameEvents[K]) => void
const handlers = new Map<keyof GameEvents, Set<(e: never) => void>>()

export function onGame<K extends keyof GameEvents>(name: K, h: Handler<K>) {
  let set = handlers.get(name)
  if (!set) handlers.set(name, (set = new Set()))
  set.add(h)
  return () => {
    set.delete(h)
  }
}

export function emitGame<K extends keyof GameEvents>(name: K, e: GameEvents[K]) {
  handlers.get(name)?.forEach((h) => (h as Handler<K>)(e))
}
