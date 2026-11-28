/**
 * First-person input (reusable): movement keys and pointer-lock mouse look.
 *
 *  • Keys: WASD / arrows move, Shift sprints, SPACE jumps. Read through `move()`.
 *  • Pointer lock on one element. `lock()` must run inside a user gesture (a click or a key press;
 *    Esc doesn't count). Mouse deltas accumulate while locked; `takeLook()` drains them.
 *  • `onChange(locked, ours)`: `ours` is true when we released the lock ourselves (mode switch,
 *    journey), false when the browser did (the player pressed Esc), which is what opens a pause menu.
 *  • A failed lock (browsers refuse a re-lock for ~1 s after Esc) is reported through `onError`.
 */
import type { MoveInput } from './PlayerController'

type Listener = (locked: boolean, ours: boolean) => void

export class FirstPersonInput {
  enabled = false
  /**
   * Tests only: pretend to hold the lock (headless browsers refuse pointer lock). Esc then acts as
   * the browser's release, and mouse movement is read from movementX/Y without a lock.
   */
  simulate = false
  private fake = false
  private el: HTMLElement | null = null
  private keys = new Set<string>()
  private dx = 0
  private dy = 0
  private releasing = false
  private listeners = new Set<Listener>()
  private errorListeners = new Set<() => void>()
  private readonly out: MoveInput = { forward: 0, right: 0, jump: false, sprint: false }

  get locked() {
    if (this.simulate) return this.fake
    return !!this.el && document.pointerLockElement === this.el
  }

  private setFake(v: boolean, ours: boolean) {
    if (this.fake === v) return
    this.fake = v
    if (!v) this.clear()
    this.listeners.forEach((l) => l(v, ours))
  }

  attach(el: HTMLElement) {
    this.detach()
    this.el = el
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.clear)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onLockChange)
    document.addEventListener('pointerlockerror', this.onLockError)
  }

  detach() {
    if (!this.el) return
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.clear)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    document.removeEventListener('pointerlockerror', this.onLockError)
    this.el = null
  }

  /**
   * Request pointer lock (call from a click / key handler). Resolves true once locked, false if
   * refused, null when the browser doesn't say (then pointerlockchange / pointerlockerror will).
   */
  lock(): Promise<boolean | null> {
    const el = this.el
    if (!el) return Promise.resolve(false)
    if (this.locked) return Promise.resolve(true)
    if (this.simulate) {
      this.setFake(true, false)
      return Promise.resolve(true)
    }
    try {
      // raw (unaccelerated) movement where supported; older engines return undefined
      const req = (el.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined).call(el, { unadjustedMovement: true })
      if (req && typeof req.then === 'function')
        return req.then(
          () => true,
          () => {
            // unadjustedMovement unsupported: plain lock
            try {
              const again = (el.requestPointerLock as () => Promise<void> | undefined).call(el)
              if (again && typeof again.then === 'function')
                return again.then(
                  () => true,
                  () => {
                    this.errorListeners.forEach((l) => l())
                    return false
                  },
                )
            } catch {
              /* fall through */
            }
            return this.locked ? true : null
          },
        )
    } catch {
      return Promise.resolve(false)
    }
    return Promise.resolve(null)
  }

  /** Release the lock ourselves (no pause menu). */
  unlock() {
    if (!this.locked) return
    if (this.simulate) return this.setFake(false, true)
    this.releasing = true
    document.exitPointerLock()
  }

  onChange(l: Listener) {
    this.listeners.add(l)
    return () => void this.listeners.delete(l)
  }

  onError(l: () => void) {
    this.errorListeners.add(l)
    return () => void this.errorListeners.delete(l)
  }

  move(): MoveInput {
    const k = this.keys
    const o = this.out
    o.forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    o.right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    o.jump = k.has('Space')
    o.sprint = k.has('ShiftLeft') || k.has('ShiftRight')
    return o
  }

  /** Mouse movement since the last call (pixels). */
  takeLook(): [number, number] {
    const r: [number, number] = [this.dx, this.dy]
    this.dx = this.dy = 0
    return r
  }

  clear = () => {
    this.keys.clear()
    this.dx = this.dy = 0
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.simulate && e.key === 'Escape' && this.fake) return this.setFake(false, false)
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return
    this.keys.add(e.code)
    // keep SPACE / arrows from scrolling or pressing focused buttons
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled || !this.locked) return
    // drop the occasional huge spike some browsers report right after locking
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return
    this.dx += e.movementX
    this.dy += e.movementY
  }

  private onLockChange = () => {
    const locked = this.locked
    const ours = !locked && this.releasing
    if (!locked) {
      this.releasing = false
      this.clear()
    }
    this.listeners.forEach((l) => l(locked, ours))
  }

  private onLockError = () => {
    this.errorListeners.forEach((l) => l())
  }
}
