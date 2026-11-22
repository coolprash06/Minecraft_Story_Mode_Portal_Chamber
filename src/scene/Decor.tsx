/**
 * Royal cloth: heraldic banners (gently rippling), the carpet runner down the centre aisle, and the
 * side runners leading to every portal, each ending in a mat bordered in that portal's colour.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three'
import { lightField, withLightField } from '../gfx/lightField'
import { bannerTexture, carpetTexture, CRESTS, MAT_PX, matTexture, runnerTexture } from '../gfx/pixelArt'
import { portalFx } from '../gfx/portalFx'
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

/**
 * Side runners (one instanced draw) and the mats in front of the frames (another). Instance i is
 * portal i. The mat's 2 px border takes the portal's colour: desaturated while the portal is dark,
 * glowing softly once it is lit (it follows the light field's fade, and the hover / ignite boost).
 */
export function Runners() {
  const runners = hall.decor.runners
  const mats = hall.decor.mats
  const runnerRef = useRef<InstancedMesh>(null)
  const matRef = useRef<InstancedMesh>(null)
  const { runnerGeo, runnerMat, matGeo, matMat } = useMemo(() => {
    const r0 = runners[0]
    const length = Math.abs(r0.xTo - r0.xFrom)
    const map = runnerTexture()
    map.repeat.set(length, 1)
    // geometry runs from x = 0 to x = length, so each instance starts at its main-carpet end
    const runnerGeo = new BoxGeometry(length, 0.04, r0.halfWidth * 2).translate(length / 2, 0.02, 0)
    const runnerMat = withLightField(new MeshStandardMaterial({ map, roughness: 0.97 }), { key: 'runner' })

    const m0 = mats[0]
    const matGeo = new BoxGeometry(m0.depth, 0.03, m0.width).translate(0, 0.015, 0)
    const P = lightField.portalLevels.value.length
    const matMat = withLightField(new MeshStandardMaterial({ map: matTexture(), roughness: 0.95 }), {
      key: 'portalMat',
      uniforms: { uPortalLevel: lightField.portalLevels, uPortalColor: lightField.portalColors, uPortalBoost: portalFx.boost },
      vertexHead: 'varying float vMatId;',
      vertex: 'vMatId = float(gl_InstanceID);',
      fragmentHead: `varying float vMatId; uniform float uPortalLevel[${P}]; uniform vec3 uPortalColor[${P}]; uniform float uPortalBoost[${P}];`,
      fragment: /* glsl */ `
        {
          vec2 px = vMapUv * vec2(${MAT_PX.w.toFixed(1)}, ${MAT_PX.h.toFixed(1)});
          float ring = min(min(px.x, px.y), min(${MAT_PX.w.toFixed(1)} - px.x, ${MAT_PX.h.toFixed(1)} - px.y));
          if (ring < ${MAT_PX.border.toFixed(1)}) {
            int pid = int(vMatId + 0.5);
            float lvl = uPortalLevel[pid];
            lvl = lvl * lvl * (3.0 - 2.0 * lvl);
            vec3 pc = uPortalColor[pid];
            float g = dot(pc, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb *= mix(vec3(g * 1.4), pc, 0.45 + 0.55 * lvl);
            totalEmissiveRadiance += pc * diffuseColor.rgb * (0.12 + lvl * 1.1 + uPortalBoost[pid] * 0.5);
          }
        }`,
    })
    return { runnerGeo, runnerMat, matGeo, matMat }
  }, [runners, mats])
  useEffect(
    () => () => {
      for (const d of [runnerGeo, runnerMat.map, runnerMat, matGeo, matMat.map, matMat]) d?.dispose()
    },
    [runnerGeo, runnerMat, matGeo, matMat],
  )
  useLayoutEffect(() => {
    const up = new Vector3(0, 1, 0)
    const one = new Vector3(1, 1, 1)
    const r = runnerRef.current
    const m = matRef.current
    if (!r || !m) return
    for (const run of runners) {
      const q = new Quaternion().setFromAxisAngle(up, run.side > 0 ? 0 : Math.PI)
      r.setMatrixAt(run.portalId, new Matrix4().compose(new Vector3(run.xFrom, 0, run.z), q, one))
    }
    for (const mat of mats) m.setMatrixAt(mat.portalId, new Matrix4().makeTranslation(...mat.position))
    r.instanceMatrix.needsUpdate = m.instanceMatrix.needsUpdate = true
    r.computeBoundingSphere()
    m.computeBoundingSphere()
  }, [runners, mats])
  return (
    <group name="runners">
      <instancedMesh ref={runnerRef} args={[runnerGeo, runnerMat, runners.length]} receiveShadow />
      <instancedMesh ref={matRef} args={[matGeo, matMat, mats.length]} receiveShadow />
    </group>
  )
}
