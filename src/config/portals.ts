/** Portal colours. Each appears once per side (2 × 9 = 18 portals), in a different order per side. */
export const PORTAL_COLORS = {
  blue: '#3a5bff',
  red: '#ff2b2b',
  green: '#2bff5c',
  yellow: '#ffd21f',
  purple: '#a63dff',
  cyan: '#1fe4ff',
  orange: '#ff8a1f',
  magenta: '#ff3dd0',
  white: '#e6ecff',
} as const

export type PortalColor = keyof typeof PORTAL_COLORS
export const COLOR_KEYS = Object.keys(PORTAL_COLORS) as PortalColor[]

/** Near → far. Left is −x, right is +x (looking down the hall towards −z). */
export const PORTAL_ORDER: Record<'left' | 'right', PortalColor[]> = {
  left: ['blue', 'red', 'green', 'purple', 'yellow', 'cyan', 'orange', 'magenta', 'white'],
  right: ['blue', 'yellow', 'green', 'red', 'cyan', 'purple', 'white', 'orange', 'magenta'],
}
