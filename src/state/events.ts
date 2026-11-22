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
