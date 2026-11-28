/**
 * ?off=a,b,c (debug knobs for performance measurement; nothing here is meant for players).
 *  post, shadows: the post stack / the shadow pool (read in Effects / Lighting)
 *  bloom, smaa, grain: single post effects
 *  surfaces, motes: the portal surfaces / the portal motes
 *  portallight: every portal's light contribution (field + pool), surfaces still shown
 *  poolportals: the shadow pool never picks a portal light (they stay field-only)
 *  hanging (chains, lanterns, chandeliers), flames, dust, props, banners, carpet, runners,
 *  frames (item frames), finale, portalfx, held: whole scene components
 */
const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
export const OFF = new Set((params.get('off') ?? '').split(',').filter(Boolean))
