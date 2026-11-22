/**
 * The end-wall finale: the Founding King's portrait (pixel-art canvas, set inside the gold frame
 * from Props) and the engraved nameplate beneath it. Both receive the light field, so the two
 * pedestal lamps in front light them from below.
 */
import { useEffect, useMemo } from 'react'
import { BoxGeometry, CanvasTexture, LinearMipmapLinearFilter, MeshStandardMaterial, NearestFilter, PlaneGeometry, SRGBColorSpace } from 'three'
import { withLightField } from '../gfx/lightField'
import { KING_H, KING_W, paintKing, paintPlaque, PLAQUE_H, PLAQUE_W } from '../gfx/portrait'
import { hall } from '../world/layout'

/** 16 px per block, like the hall's own textures. */
const PX = 1 / 16
const PLAQUE = { w: 1.875, h: 0.3125, d: 0.05 }

function pixelTexture(w: number, h: number, data: Uint8ClampedArray) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
  const t = new CanvasTexture(c)
  t.magFilter = NearestFilter // crisp pixels up close
  t.minFilter = LinearMipmapLinearFilter // no shimmer from down the hall
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function Finale() {
  const { portrait, plaque } = hall.decor.finale
  const parts = useMemo(() => {
    const canvasGeo = new PlaneGeometry(KING_W * PX, KING_H * PX)
    const king = paintKing()
    const canvasMat = withLightField(
      new MeshStandardMaterial({ map: pixelTexture(KING_W, KING_H, king.px), emissiveMap: pixelTexture(KING_W, KING_H, king.glow), emissive: '#ffffff', roughness: 0.82 }),
      { key: 'portrait', env: 0.15 },
    )
    const plaqueGeo = new BoxGeometry(PLAQUE.w, PLAQUE.h, PLAQUE.d)
    const face = withLightField(new MeshStandardMaterial({ map: pixelTexture(PLAQUE_W, PLAQUE_H, paintPlaque()), roughness: 0.45, metalness: 0.35 }), { key: 'plaque', env: 0.8 })
    const edge = withLightField(new MeshStandardMaterial({ color: '#8a6418', roughness: 0.4, metalness: 0.8 }), { key: 'plaqueEdge', env: 1.2 })
    // BoxGeometry groups: +x, −x, +y, −y, +z (front), −z
    return { canvasGeo, canvasMat, plaqueGeo, plaqueMats: [edge, edge, edge, edge, face, edge] }
  }, [])
  useEffect(
    () => () => {
      parts.canvasGeo.dispose()
      parts.plaqueGeo.dispose()
      parts.canvasMat.emissiveMap?.dispose()
      for (const m of [parts.canvasMat, ...new Set(parts.plaqueMats)]) (m.map?.dispose(), m.dispose())
    },
    [parts],
  )
  const [px, py, pz] = portrait.position
  const [qx, qy, qz] = plaque.position
  return (
    <group name="finale">
      {/* just proud of the wall, inside the frame's moulding */}
      <mesh geometry={parts.canvasGeo} material={parts.canvasMat} position={[px, py, pz + 0.03]} receiveShadow />
      <mesh geometry={parts.plaqueGeo} material={parts.plaqueMats} position={[qx, qy, qz + PLAQUE.d / 2]} castShadow receiveShadow />
    </group>
  )
}
