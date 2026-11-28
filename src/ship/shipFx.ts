/**
 * The ship world's per-frame effect levels (GSAP tweens them; the post stack, the deck portal and
 * the camera read them every frame) and its small UI store. The hall's own `warpFx` / `cameraFx`
 * are never touched from here: the hall resumes later with exactly the values it left with.
 */
import { flashColorFor } from '../controls/EntryRig'
import { PORTAL_COLORS } from '../config/portals'
import { REDUCED_MOTION } from '../lib/device'
import { createStore } from '../state/store'

/** The hall portal this world belongs to (portal 0, blue). */
export const HOME_PORTAL = 0

const blue = PORTAL_COLORS.blue
/** The veil's colour: the whiteout, or with reduced motion the portal colour's dark tint. */
const veilHex = () => {
  if (!REDUCED_MOTION) return flashColorFor(HOME_PORTAL)
  const n = parseInt(blue.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.18))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

export const shipFx = {
  /** Pulse vignette in the portal colour (0..1). */
  pulse: 0,
  /** Swirl distortion (0..1). */
  warp: 0,
  /** Whiteout towards `flashColor` (0..1); at 1 the DOM veil takes over in exactly that colour. */
  flash: 0,
  /** Extra bloom. */
  bloom: 0,
  /** Extra field of view (degrees). */
  fov: 0,
  /** The deck portal's spiral mode (0..1) and its flare (0..1). */
  spiral: 0,
  flare: 0,
  color: blue as string,
  flashColor: veilHex(),
}

export const shipStore = createStore({
  /** Prompt under the crosshair ('' = none). */
  prompt: '',
  /** The arrival is over: the player has control. */
  arrived: false,
  /** ?bench: recording may start (the arrival has settled). */
  benchReady: false,
})
