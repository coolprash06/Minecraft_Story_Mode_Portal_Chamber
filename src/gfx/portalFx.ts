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
  /**
   * Entry "spiral mode" (0..1): rings and arms grow from the centre of the surface, the swirl
   * speeds up, motes stream back into the opening and the light pool brightens (tweened by EntryRig).
   */
  spiral: new Float32Array(P),
  /** Spiral clock per portal (s), advanced faster as `spiral` rises, so speeding up never jumps. */
  spiralTime: new Float32Array(P),
  /** Mote clock per portal (s), likewise. */
  moteTime: new Float32Array(P),
  /** Surface opacity multiplier (1 = normal). Only the reduced-motion extinguish fades it. */
  fade: new Float32Array(P).fill(1),
}

/** Camera effects added on top of the rig (GlideRig, EntryRig, later Free Roam). */
export const cameraFx = {
  /** Shake amplitude (0..1). */
  shake: 0,
  /** Extra field of view (degrees). */
  fov: 0,
}

/**
 * Full-screen effects for the portal entry (read by the post stack each frame):
 *  • pulse: a vignette in the portal's colour, pulsing at the edges (0..1);
 *  • warp: a swirl distortion strongest at the screen edges, plus a chromatic fringe on High (0..1);
 *  • flash: the whiteout, mixing the whole screen to `flashColor` (0..1). At 1 the DOM veil
 *    takes over in exactly that colour.
 */
export const warpFx = {
  /** Soft whole-screen dimming (0..1): the extinguish pulse. */
  dim: 0,
  pulse: 0,
  warp: 0,
  flash: 0,
  /** Portal colour (sRGB hex) for the pulse. */
  color: '#3a5bff',
  /** Whiteout colour (sRGB hex): the portal colour, lifted towards white. */
  flashColor: '#a9b9ff',
}

/** Extra bloom on top of the base intensity (the ignite kick, the jump). */
export const postFx = { bloom: 0 }
