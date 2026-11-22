/**
 * Hover outlines: a thin glowing rectangle just proud of a wall, drawn additive in HDR so the bloom
 * turns it into a soft halo. Plus the shared point-sprite scale for the small particle systems.
 */
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type PerspectiveCamera } from 'three'
import type { Placement } from '../world/layout'

/** Rectangle outline (w × h outer, bars `t` thick) in the XY plane, facing +Z, centred. */
export function outlineGeometry(w: number, h: number, t: number) {
  const pos: number[] = []
  const quad = (x0: number, y0: number, x1: number, y1: number) => pos.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0)
  const x = w / 2
  const y = h / 2
  quad(-x, y - t, x, y) // top
  quad(-x, -y, x, -y + t) // bottom
  quad(-x, -y + t, -x + t, y - t) // left
  quad(x - t, -y + t, x, y - t) // right
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  return g
}

export function outlineMaterial(color: string, gain = 2.2) {
  return new MeshBasicMaterial({
    color: new Color(color).multiplyScalar(gain),
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  })
}

/** World matrix that puts a +Z-facing, XY-plane object on a wall placement, `lift` m off the wall. */
export function wallMatrix(p: Placement, lift = 0, y = p.position[1]) {
  const n = new Vector3(...p.normal)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n)
  const pos = new Vector3(p.position[0], y, p.position[2]).addScaledVector(n, lift)
  return new Matrix4().compose(pos, q, new Vector3(1, 1, 1))
}

/** Pixels per metre at 1 m for gl_PointSize (drawing-buffer height / (2 tan(fov / 2))). */
export function pointScaleFor(height: number, camera: PerspectiveCamera) {
  return height / (2 * Math.tan(((camera.fov ?? 60) * Math.PI) / 360))
}
