/**
 * The ship's post stack: the hall's chain and effect classes (warp distortion in its own pass,
 * only while active · bloom · ACES · grade · vignette · warp tint · SMAA on High · grain), with a
 * lighter vignette for daylight and a lower bloom (only the sun, the glints and the portal exceed
 * the threshold). Reads `shipFx`, never the hall's `warpFx`.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, type BloomEffect, EffectPass, ToneMappingMode } from 'postprocessing'
import { Color } from 'three'
import { OFF } from '../lib/debug'
import { GradeEffect, NO_POST, WarpDistortEffect, WarpTintEffect } from '../scene/Effects'
import { useApp } from '../state/store'
import { shipFx } from './shipFx'

/** Frames the distortion pass runs at the start, so its program is compiled before it's needed. */
const WARP_WARMUP_FRAMES = 4

export function ShipEffects() {
  const high = useApp((s) => s.quality) === 'high'
  const camera = useThree((s) => s.camera)
  const grade = useMemo(() => new GradeEffect(), [])
  const tint = useMemo(() => new WarpTintEffect(), [])
  const { distort, distortPass } = useMemo(() => {
    const distort = new WarpDistortEffect()
    return { distort, distortPass: new EffectPass(camera, distort) }
  }, [camera])
  useEffect(
    () => () => {
      distortPass.dispose()
      grade.dispose()
      tint.dispose()
    },
    [distortPass, grade, tint],
  )
  const bloom = useRef<BloomEffect>(null)
  const baseBloom = high ? 0.85 : 0.7
  const warm = useRef(0)
  const c = useMemo(() => ({ color: new Color(), flash: new Color() }), [])

  useFrame(({ size, clock }) => {
    const aspect = size.width / Math.max(1, size.height)
    const t = clock.elapsedTime
    if (bloom.current) bloom.current.intensity = baseBloom + shipFx.bloom
    const tu = tint.uniforms
    tu.get('uPulse')!.value = shipFx.pulse
    tu.get('uDim')!.value = 0
    tu.get('uFlash')!.value = shipFx.flash
    tu.get('uColor')!.value = c.color.set(shipFx.color)
    tu.get('uFlashColor')!.value = c.flash.set(shipFx.flashColor)
    tu.get('uAspect')!.value = aspect
    tu.get('uT')!.value = t
    const du = distort.uniforms
    du.get('uWarp')!.value = shipFx.warp
    du.get('uFringe')!.value = high ? 1 : 0
    du.get('uAspect')!.value = aspect
    du.get('uT')!.value = t
    if (warm.current < WARP_WARMUP_FRAMES) warm.current++
    distortPass.enabled = warm.current < WARP_WARMUP_FRAMES || shipFx.warp > 0.001
  })

  return (
    <EffectComposer multisampling={0} enableNormalPass={false} enabled={!NO_POST}>
      <primitive object={distortPass} dispose={null} />
      {OFF.has('bloom') ? <></> : <Bloom ref={bloom} mipmapBlur luminanceThreshold={1.0} luminanceSmoothing={0.25} intensity={baseBloom} radius={0.7} />}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <primitive object={grade} dispose={null} />
      <Vignette offset={0.3} darkness={0.42} />
      <primitive object={tint} dispose={null} />
      {high && !OFF.has('smaa') ? <SMAA /> : <></>}
      {OFF.has('grain') ? <></> : <Noise blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.035} />}
    </EffectComposer>
  )
}
