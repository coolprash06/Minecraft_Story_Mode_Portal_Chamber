/**
 * The selected hotbar item, held at the lower right of the view: it slides up when selected, down
 * when put away, bobs gently, and swings forward when struck on a portal.
 */
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import gsap from 'gsap'
import { Euler, Mesh, Quaternion, Vector3 } from 'three'
import { flintById } from '../config/items'
import { slotMaterials } from '../gfx/materials'
import { onGame } from '../state/events'
import { appStore } from '../state/store'
import { HELD_REST, HELD_REST_ROT, HELD_SCALE } from './heldPose'
import { flintGeometry } from './ItemFrames'

/** Camera-space rest pose (shared with the flint's return flight, which starts from the hand). */
const REST = HELD_REST
const REST_ROT = HELD_REST_ROT
const _off = new Vector3()
const _q = new Quaternion()
const _e = new Euler()

export function HeldItem() {
  const ref = useRef<Mesh>(null)
  const materials = slotMaterials()
  /** equip: 0 = lowered out of view, 1 = held. swing: 0..1 strike motion. */
  const st = useRef({ id: null as string | null, target: null as string | null, equip: 0, swing: 0, tween: null as gsap.core.Tween | null })

  // returning the flint: it leaves the hand at once (the frame's flight takes over from this pose)
  useEffect(
    () =>
      onGame('returnFlint', () => {
        const s = st.current
        s.tween?.kill()
        gsap.killTweensOf(s)
        s.id = null
        s.target = null
        s.equip = 0
        s.swing = 0
      }),
    [],
  )
  useEffect(
    () =>
      onGame('strike', () => {
        const s = st.current
        gsap.killTweensOf(s, 'swing')
        gsap.timeline().to(s, { swing: 1, duration: 0.11, ease: 'power2.out' }).to(s, { swing: 0, duration: 0.38, ease: 'power2.inOut' })
      }),
    [],
  )

  useFrame(({ camera, clock }) => {
    const m = ref.current
    if (!m) return
    const s = st.current
    const state = appStore.get()
    // put away while entering a portal (and out of view until back in the hall)
    const want = state.journey === 'hall' && state.selected >= 0 ? state.hotbar[state.selected] : null
    if (want !== s.target) {
      // lower the current item (if any), swap, raise the new one
      s.target = want
      s.tween?.kill()
      const raise = () => {
        s.id = s.target
        const def = flintById(s.id)
        if (def) m.geometry = flintGeometry(def)
        if (s.id) s.tween = gsap.to(s, { equip: 1, duration: 0.3, ease: 'power3.out' })
      }
      if (s.id && s.equip > 0.01) s.tween = gsap.to(s, { equip: 0, duration: 0.16, ease: 'power2.in', onComplete: raise })
      else raise()
    }
    const visible = s.id !== null && s.equip > 0.001
    m.visible = visible
    if (!visible) return

    const t = clock.elapsedTime
    const sw = s.swing
    _off.copy(REST)
    _off.y += -0.28 * (1 - s.equip) + Math.sin(t * 1.6) * 0.006
    _off.x += Math.sin(t * 0.8) * 0.003 - sw * 0.05
    _off.z -= sw * 0.09
    _e.set(REST_ROT.x - sw * 0.9 + (1 - s.equip) * 0.6, REST_ROT.y + sw * 0.25, REST_ROT.z + Math.sin(t * 1.1) * 0.01)
    _q.setFromEuler(_e)
    m.position.copy(_off).applyQuaternion(camera.quaternion).add(camera.position)
    m.quaternion.copy(camera.quaternion).multiply(_q)
  })

  return <mesh ref={ref} material={materials} visible={false} frustumCulled={false} scale={HELD_SCALE} dispose={null} />
}
