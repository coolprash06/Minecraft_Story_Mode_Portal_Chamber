/**
 * Pointer interaction in Glide: hover picking every frame (after the rig has moved the camera) and
 * click-to-interact. A click only counts when the button went down and up on the canvas without
 * moving more than a few pixels; anything longer is a drag-look (GlideRig) and never interacts.
 */
import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { interact, isFlying } from '../state/game'
import { appStore, type Hover } from '../state/store'
import { lookState } from './GlideRig'
import { pick, type Target } from './interact'

/** Max pointer travel (px) between down and up for a click. */
const CLICK_SLOP = 5

/** Latest pointer state (shared with the HUD prompt, which follows the cursor). */
export const pointer = { clientX: 0, clientY: 0, ndcX: 0, ndcY: 0, over: false }

const sameHover = (a: Hover, b: Hover) =>
  a === b || (!!a && !!b && a.kind === b.kind && (a.kind === 'frame' ? a.flintId === (b as typeof a).flintId : a.portalId === (b as typeof a).portalId))

/** Frames are interactive while their flint waits in them (take) and while it is out (return). */
const enabled = (t: Target) => {
  const h = t.hover
  return h.kind === 'portal' || !isFlying(h.flintId)
}

export function Interaction() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const el = gl.domElement
    let down: { x: number; y: number; travel: number } | null = null
    const onMove = (e: PointerEvent) => {
      pointer.clientX = e.clientX
      pointer.clientY = e.clientY
      const r = el.getBoundingClientRect()
      pointer.ndcX = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.ndcY = -((e.clientY - r.top) / r.height) * 2 + 1
      pointer.over = e.target === el
      if (down) down.travel = Math.max(down.travel, Math.hypot(e.clientX - down.x, e.clientY - down.y))
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === 'touch') return
      down = { x: e.clientX, y: e.clientY, travel: 0 }
    }
    const onUp = (e: PointerEvent) => {
      const d = down
      down = null
      if (!d || e.button !== 0 || e.target !== el) return
      if (d.travel > CLICK_SLOP || lookState.dragging) return
      const s = appStore.get()
      if (s.mode !== 'glide' || !s.sceneReady || s.journey !== 'hall') return
      interact(s.hover)
    }
    const onLeave = () => (pointer.over = false)
    window.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      el.style.cursor = ''
    }
  }, [gl])

  useFrame(({ camera }) => {
    const s = appStore.get()
    let h: Hover = null
    if (pointer.over && !lookState.dragging && s.sceneReady && s.mode === 'glide' && s.journey === 'hall') h = pick(camera, pointer.ndcX, pointer.ndcY, enabled)?.hover ?? null
    if (!sameHover(h, s.hover)) appStore.set({ hover: h })
    const cursor = h ? 'pointer' : ''
    if (gl.domElement.style.cursor !== cursor) gl.domElement.style.cursor = cursor
  })

  return null
}
