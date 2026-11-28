/**
 * Shared pirate animations: procedural poses sampled per frame (no keyframe data, no React
 * re-renders). Loops: idle, walk, hostile. One-shots: trade, attack, hurt, death, after which the
 * animator returns to its loop (attack returns to hostile, death respawns into idle).
 * Every change of animation blends from the current pose over BLEND seconds.
 *
 * Hostile and attack go through hostileAllowed(): while PIRATES_PASSIVE is true they only play
 * when triggered manually (the showcase buttons).
 */
import { hostileAllowed } from '../config/pirates'
import type { Eyes } from './pirateModel'

export type AnimName = 'idle' | 'walk' | 'trade' | 'hostile' | 'attack' | 'hurt' | 'death'
type LoopName = 'idle' | 'walk' | 'hostile'

export const ANIMS: { id: AnimName; label: string; hostile: boolean }[] = [
  { id: 'idle', label: 'Idle', hostile: false },
  { id: 'walk', label: 'Walk', hostile: false },
  { id: 'trade', label: 'Trade', hostile: false },
  { id: 'hostile', label: 'Hostile', hostile: true },
  { id: 'attack', label: 'Attack', hostile: true },
  { id: 'hurt', label: 'Hurt', hostile: false },
  { id: 'death', label: 'Death', hostile: false },
]
const HOSTILE = new Set<AnimName>(['hostile', 'attack'])
const LOOPS = new Set<AnimName>(['idle', 'walk', 'hostile'])

/** One-shot durations (s). */
const DURATION: Partial<Record<AnimName, number>> = { trade: 1.9, attack: 0.75, hurt: 0.55, death: 2.7 }
/** Death: the smoke puff, the respawn (showcase only) and its pop-in. */
export const PUFF_AT = 1.05
const RESPAWN_AT = 2.25
const BLEND = 0.2

export interface Pose {
  rootY: number
  rootZ: number
  rootRX: number
  rootRZ: number
  bodyRX: number
  bodyRY: number
  headRX: number
  headRY: number
  armLX: number
  armLZ: number
  armRX: number
  armRZ: number
  legLX: number
  legRX: number
  /** Red hurt flash, 0..1. */
  flash: number
  /** Overall scale multiplier (respawn pop). */
  scale: number
  eyes: Eyes
  hidden: boolean
}

type NumKey = Exclude<keyof Pose, 'eyes' | 'hidden'>
const NUM: NumKey[] = ['rootY', 'rootZ', 'rootRX', 'rootRZ', 'bodyRX', 'bodyRY', 'headRX', 'headRY', 'armLX', 'armLZ', 'armRX', 'armRZ', 'legLX', 'legRX', 'flash', 'scale']

export const restPose = (): Pose => ({
  rootY: 0,
  rootZ: 0,
  rootRX: 0,
  rootRZ: 0,
  bodyRX: 0,
  bodyRY: 0,
  headRX: 0,
  headRY: 0,
  armLX: 0,
  armLZ: 0.06,
  armRX: -0.25,
  armRZ: -0.06,
  legLX: 0,
  legRX: 0,
  flash: 0,
  scale: 1,
  eyes: 'open',
  hidden: false,
})

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a))
  return x * x * (3 - 2 * x)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOutBack = (x: number) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2

/* Arm angles: rotation.x < 0 swings an arm forward/up; rotation.z > 0 lifts the left arm outward
   (and < 0 the right). Head / body rotation.x > 0 tilts forward (nod). Root rotation.x < 0 topples
   backwards about the feet. */

function idle(t: number, o: Pose) {
  Object.assign(o, restPose())
  const br = Math.sin(t * 1.9)
  o.bodyRX = 0.015 * br
  o.armLZ = 0.07 + 0.025 * br
  o.armRZ = -0.07 - 0.025 * br
  o.armRX = -0.25 + 0.04 * br
  o.armLX = 0.03 * br
  // looking around: a slow wander with a quicker glance on top
  o.headRY = 0.42 * Math.sin(t * 0.45) + 0.12 * Math.sin(t * 1.3 + 1)
  o.headRX = 0.06 * Math.sin(t * 0.7) - 0.02
  o.eyes = t % 3.9 > 3.76 ? 'closed' : 'open'
}

function walk(t: number, o: Pose) {
  Object.assign(o, restPose())
  const ph = t * Math.PI * 2 * 1.05
  const s = Math.sin(ph)
  o.legLX = 0.62 * s
  o.legRX = -0.62 * s
  o.armLX = -0.5 * s
  o.armRX = -0.3 + 0.32 * s
  o.armLZ = 0.06
  o.armRZ = -0.06
  o.rootY = 0.028 * (1 - Math.abs(s)) - 0.01
  o.bodyRX = 0.06
  o.bodyRY = 0.06 * s
  o.headRX = -0.04
  o.headRY = -0.05 * s
  o.eyes = t % 3.9 > 3.76 ? 'closed' : 'open'
}

function trade(t: number, o: Pose) {
  idle(t, o)
  const k = smooth(0, 0.3, t) * (1 - smooth(1.5, 1.9, t))
  // two nods
  const nodT = clamp01((t - 0.2) / 1.0)
  o.headRX = lerp(o.headRX, 0.3 * Math.abs(Math.sin(nodT * Math.PI * 2)), k)
  o.headRY *= 1 - k
  // the left hand opens towards you, palm up
  o.armLX = lerp(o.armLX, -1.2, k)
  o.armLZ = lerp(o.armLZ, 0.32, k)
  o.armRX = lerp(o.armRX, -0.12, k)
  o.bodyRX = lerp(o.bodyRX, 0.05, k)
  o.eyes = t > 0.7 && t < 0.85 ? 'closed' : 'open'
}

function hostile(t: number, o: Pose) {
  Object.assign(o, restPose())
  const br = Math.sin(t * 3.4)
  o.legLX = -0.34
  o.legRX = 0.3
  o.rootY = -0.035
  o.bodyRX = 0.17 + 0.012 * br
  o.bodyRY = -0.14
  o.armRX = -2.35 + 0.06 * br // dagger raised
  o.armRZ = -0.2
  o.armLX = -0.75 // guard
  o.armLZ = 0.38
  o.headRX = -0.1
  o.headRY = 0.14 + 0.05 * Math.sin(t * 0.9)
  o.eyes = 'narrow'
}

function attack(t: number, o: Pose) {
  hostile(t, o)
  const a = smooth(0, 0.18, t) // wind-up
  const b = smooth(0.18, 0.32, t) // strike
  const rec = smooth(0.42, 0.75, t) // recover
  o.armRX = lerp(lerp(lerp(-2.35, -2.95, a), -0.2, b), -2.35, rec)
  const hit = b * (1 - rec)
  o.bodyRX = 0.17 + 0.32 * hit - 0.08 * a * (1 - b)
  o.bodyRY = -0.14 + (-0.25 * a * (1 - b) + 0.45 * b) * (1 - rec)
  o.rootZ = 0.2 * hit
  o.legLX = -0.34 - 0.25 * hit
  o.legRX = 0.3 + 0.15 * hit
  o.armLX = -0.75 + 0.5 * hit
}

function hurt(t: number, base: LoopName, o: Pose) {
  sampleLoop(base, t, o)
  const k = t < 0.08 ? t / 0.08 : 1 - smooth(0.08, 0.55, t)
  const kb = t < 0.12 ? smooth(0, 0.12, t) : 1 - smooth(0.12, 0.55, t)
  o.flash = t < 0.4 ? 1 - t / 0.4 : 0
  o.rootZ -= 0.3 * kb
  o.rootRX -= 0.22 * k
  o.rootY += 0.06 * Math.sin(Math.PI * clamp01(t / 0.26))
  o.headRX -= 0.35 * k
  o.armLZ += 0.5 * k
  o.armRZ -= 0.5 * k
  o.armLX -= 0.4 * k
  if (t < 0.25) o.eyes = 'closed'
}

function death(t: number, o: Pose) {
  if (t >= RESPAWN_AT) {
    idle(t - RESPAWN_AT, o)
    o.scale = Math.max(0.001, easeOutBack(clamp01((t - RESPAWN_AT) / 0.4)))
    return
  }
  Object.assign(o, restPose())
  const recoil = smooth(0, 0.12, t)
  const fall = clamp01((t - 0.12) / 0.6) ** 3
  const bounce = Math.sin(Math.PI * clamp01((t - 0.72) / 0.22)) * (t > 0.72 ? 1 : 0)
  o.flash = t < 0.35 ? 1 - t / 0.35 : 0
  o.rootRX = -(Math.PI / 2) * fall + 0.09 * bounce
  o.rootZ = -0.1 * recoil
  o.headRX = -0.35 * recoil
  o.armLZ = 0.06 + 0.9 * recoil
  o.armRZ = -0.06 - 0.9 * recoil
  o.armLX = -0.5 * recoil
  o.armRX = -0.6 * recoil
  o.legLX = -0.15 * recoil
  o.eyes = 'closed'
  o.hidden = t >= PUFF_AT + 0.06
}

function sampleLoop(name: LoopName, t: number, o: Pose) {
  if (name === 'walk') walk(t, o)
  else if (name === 'hostile') hostile(t, o)
  else idle(t, o)
}

function sample(name: AnimName, t: number, loop: LoopName, o: Pose) {
  switch (name) {
    case 'trade':
      return trade(t, o)
    case 'attack':
      return attack(t, o)
    case 'hurt':
      return hurt(t, loop, o)
    case 'death':
      return death(t, o)
    default:
      return sampleLoop(name, t, o)
  }
}

export class PirateAnimator {
  anim: AnimName = 'idle'
  loop: LoopName = 'idle'
  t = 0
  readonly pose = restPose()
  private readonly from = restPose()
  private readonly target = restPose()
  private blend = 1
  /** Fired once per death, at the moment the body vanishes in smoke. */
  onPuff: (() => void) | null = null
  /** Fired whenever the playing animation changes (for the UI). */
  onChange: ((a: AnimName) => void) | null = null

  /** Starts an animation. Hostile ones need hostileAllowed(manual). Returns false if refused. */
  play(name: AnimName, manual = false) {
    if (HOSTILE.has(name) && !hostileAllowed(manual)) return false
    if (this.anim === 'death' && this.t < RESPAWN_AT) return false
    this.start(name)
    return true
  }

  reset() {
    Object.assign(this.pose, restPose())
    this.anim = 'idle'
    this.loop = 'idle'
    this.t = 0
    this.blend = 1
    this.onChange?.('idle')
  }

  private start(name: AnimName) {
    Object.assign(this.from, this.pose)
    this.blend = 0
    this.anim = name
    this.t = 0
    if (LOOPS.has(name)) this.loop = name as LoopName
    this.onChange?.(name)
  }

  update(dt: number) {
    const prev = this.t
    this.t += dt
    if (this.anim === 'death' && prev < PUFF_AT && this.t >= PUFF_AT) this.onPuff?.()
    const dur = DURATION[this.anim]
    if (dur !== undefined && this.t >= dur) {
      if (this.anim === 'death') {
        // already standing (respawned): settle into idle
        this.loop = 'idle'
        this.start('idle')
      } else this.start(this.anim === 'attack' ? 'hostile' : this.loop)
    }
    sample(this.anim, this.t, this.loop, this.target)
    this.blend = Math.min(1, this.blend + dt / BLEND)
    const w = this.blend * this.blend * (3 - 2 * this.blend)
    for (const k of NUM) this.pose[k] = lerp(this.from[k], this.target[k], w)
    this.pose.flash = this.target.flash // the hit flash is instant, never blended in
    this.pose.eyes = this.target.eyes
    this.pose.hidden = this.target.hidden
  }
}
