/**
 * Deterministic, time-based motion shared by the models and the light field, so a swaying lantern
 * and the light it casts always agree without passing state around.
 */
import { Matrix4, Quaternion, Vector3, Euler } from 'three'
import type { LanternInfo } from './layout'

/** Pendulum angles (radians, about x and z) for a hanging lantern / chandelier at time t. */
export function swayAngles(l: LanternInfo, t: number, out: { x: number; z: number }) {
  const s = l.id * 1.618
  // Chandeliers are heavy: slower and smaller swing.
  const amp = l.kind === 'chandelier' ? 0.018 : 0.04
  const w = l.kind === 'chandelier' ? 0.55 : 0.9
  out.x = amp * (Math.sin(t * w + s) * 0.8 + Math.sin(t * w * 1.73 + s * 2.1) * 0.2)
  out.z = amp * (Math.sin(t * w * 0.87 + s * 1.3) * 0.8 + Math.sin(t * w * 2.11 + s) * 0.2)
  return out
}

const _ang = { x: 0, z: 0 }
const _e = new Euler()
const _q = new Quaternion()
const _one = new Vector3(1, 1, 1)
const _anchor = new Vector3()

/** World matrix of a hanging thing's pivot (anchor + sway rotation). Standing: identity at anchor. */
export function pivotMatrix(l: LanternInfo, t: number, out: Matrix4) {
  if (!l.anchor) return out.makeTranslation(l.position[0], l.position[1], l.position[2])
  swayAngles(l, t, _ang)
  _e.set(_ang.x, 0, _ang.z)
  _q.setFromEuler(_e)
  _anchor.set(l.anchor[0], l.anchor[1], l.anchor[2])
  return out.compose(_anchor, _q, _one)
}

/** Torch flicker multiplier (~0.75..1.05): fast, irregular. */
export function torchFlicker(seed: number, t: number) {
  return (
    0.86 +
    0.07 * Math.sin(t * 9.1 + seed * 3.7) +
    0.05 * Math.sin(t * 23.7 + seed * 1.3) +
    0.03 * Math.sin(t * 41.3 + seed * 5.1) +
    0.03 * Math.sin(t * 3.1 + seed)
  )
}

/** Soul-fire breathing (~0.97..1.0): slower and steadier still than a lantern. */
export function soulFlicker(seed: number, t: number) {
  return 0.985 + 0.009 * Math.sin(t * 1.35 + seed) + 0.005 * Math.sin(t * 4.1 + seed * 1.7)
}

/** Lantern breathing (~0.95..1.0): slow and steady. */
export function lanternFlicker(seed: number, t: number) {
  return 0.975 + 0.018 * Math.sin(t * 2.3 + seed) + 0.008 * Math.sin(t * 7.9 + seed * 2.0)
}
