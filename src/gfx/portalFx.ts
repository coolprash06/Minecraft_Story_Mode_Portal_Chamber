/**
 * Per-portal effect levels shared by the portal surface shader, the frame glow and the FX
 * components, plus the camera's shake / FOV pulse. Plain arrays and objects that GSAP tweens and
 * the shaders read each frame, so effects never re-render React.
 */
import { appStore, isLit } from '../state/store'
import { hall } from '../world/layout'

const P = hall.portals.length
const lit0 = appStore.get().litMask

export const portalFx = {
  /** Surface fill, bottom → top (0..1). Lit at load (session restore, ?lit) = already full. */
  fill: Float32Array.from(hall.portals, (p) => (isLit(lit0, p.id) ? 1 : 0)),
  /** Hover highlight (0..1, damped). */
  hover: new Float32Array(P),
  /** Ignition flash (0..1, tweened). */
  flash: new Float32Array(P),
  /** Frame glow boost uniform (hover + flash), written by Portals each frame. */
  boost: { value: new Float32Array(P) },
}

/** Camera effects added on top of the rig (GlideRig, later Free Roam). */
export const cameraFx = {
  /** Shake amplitude (0..1). */
  shake: 0,
  /** Extra field of view (degrees). */
  fov: 0,
}
