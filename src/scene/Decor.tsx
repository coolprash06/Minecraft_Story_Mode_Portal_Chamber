/** Royal cloth: heraldic banners (gently rippling) and the carpet runner down the centre aisle. */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three'
import { withLightField } from '../gfx/lightField'
import { bannerTexture, carpetTexture, CRESTS } from '../gfx/pixelArt'
import { hall } from '../world/layout'

const BANNER_W = 1.45
const BANNER_H = 3.35

const bannerTime = { value: 0 }

export function Banners() {
  const geo = useMemo(() => new PlaneGeometry(BANNER_W, BANNER_H, 1, 16).translate(0, -BANNER_H / 2, 0), [])
  const groups = useMemo(
    () =>
      CRESTS.map((_, crest) => ({
        crest,
        items: hall.decor.banners.filter((b) => b.crest === crest),
        material: withLightField(new MeshStandardMaterial({ map: bannerTexture(crest), alphaTest: 0.5, side: DoubleSide, roughness: 0.95 }), {
          key: 'banner',
          uniforms: { uBannerTime: bannerTime },
          vertexHead: 'uniform float uBannerTime;',
          vertex: /* glsl */ `
            {
              float depth = -position.y / ${BANNER_H.toFixed(2)};
              float phase = 0.0;
              #ifdef USE_INSTANCING
                phase = dot(instanceMatrix[3].xyz, vec3(0.37, 0.0, 0.21));
              #endif
              transformed.z += (sin(uBannerTime * 1.1 + phase + position.y * 1.7) * 0.07
                              + sin(uBannerTime * 2.3 + phase * 2.0 + position.x * 3.0) * 0.015) * depth * depth;
            }`,
        }),
      })),
    [],
  )
  useEffect(() => () => groups.forEach((g) => (g.material.map?.dispose(), g.material.dispose())), [groups])
  useFrame((_, dt) => (bannerTime.value += dt))
  return (
    <group name="banners">
      {groups.map((g) => g.items.length > 0 && <BannerGroup key={g.crest} items={g.items} geo={geo} material={g.material} />)}
    </group>
  )
}

function BannerGroup({ items, geo, material }: { items: typeof hall.decor.banners; geo: PlaneGeometry; material: MeshStandardMaterial }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    items.forEach((b, i) => {
      const yaw = Math.atan2(b.normal[0], b.normal[2])
      // hang just in front of the wall, from under the rod
      const p = new Vector3(...b.position).add(new Vector3(...b.normal).multiplyScalar(0.02))
      p.y -= 0.05
      m.setMatrixAt(i, new Matrix4().compose(p, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1)))
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])
  return <instancedMesh ref={ref} args={[geo, material, items.length]} castShadow receiveShadow />
}

export function Carpet() {
  const { halfWidth, zStart, zEnd } = hall.decor.carpet
  const length = zStart - zEnd
  const { geo, material } = useMemo(() => {
    const map = carpetTexture()
    map.repeat.set(1, length)
    const material = withLightField(new MeshStandardMaterial({ map, roughness: 0.97 }), { key: 'carpet' })
    return { geo: new BoxGeometry(halfWidth * 2, 0.05, length), material }
  }, [halfWidth, length])
  useEffect(() => () => (geo.dispose(), material.map?.dispose(), material.dispose()), [geo, material])
  return <mesh geometry={geo} material={material} position={[0, 0.025, (zStart + zEnd) / 2]} receiveShadow />
}
