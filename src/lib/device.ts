/**
 * Reduced motion: decided once at startup (like quality). With it, portal entry skips the head
 * bob, the FOV stretch, the warp swirl and every camera shake, and simply fades into the dimension.
 * ?motion=reduce forces it on (to test without changing the OS setting); ?motion=full forces it off.
 */
const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)

function reduced() {
  const m = params.get('motion')
  if (m === 'reduce') return true
  if (m === 'full') return false
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
}

export const REDUCED_MOTION = reduced()

/** Touch-first device (no mouse): Free Roam (pointer lock + keyboard) is not offered. */
export const COARSE_POINTER = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false)
