/** Single source of truth for scene + UI colours. */
export const COLORS = {
  /** Far-end fog / clear colour: blue-black. */
  fog: '#05060c',
  /** Cool fill so shadows read navy, never pure black. */
  ambient: '#4a5680',
  ambientGround: '#120f14',
  torch: '#ffa04a',
  lantern: '#ffc982',
  ui: '#e9e6f2',
  uiDim: '#9a96ad',
} as const

/** Fog density (FogExp2): ~65 % visibility at 40 m, ~5 % at the far wall (~110 m). */
export const FOG_DENSITY = 0.016
