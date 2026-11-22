/**
 * Everything that hangs and sways: chains, hanging lanterns and chandeliers. Each assembly swings
 * rigidly about its beam anchor (world/motion.ts); the light field uses the same motion, so the
 * light moves with the lantern.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Matrix4 } from 'three'
import { slotMaterials } from '../gfx/materials'
import { partsToGeometry } from '../gfx/voxel'
import { hall } from '../world/layout'
import { pivotMatrix } from '../world/motion'
import { CHAIN_SCALE, CHAIN_STEP_PX, chainLink, chandelier, CHANDELIER_SCALE, lantern, LANTERN_PX_H, LANTERN_SCALE } from './models'

interface Part {
  owner: number
  local: Matrix4
}

export function Hanging() {
  const materials = useMemo(slotMaterials, [])
  const { geos, parts } = useMemo(() => {
    const geos = {
      link: partsToGeometry(chainLink().mesh(CHAIN_SCALE, [0, 4, 0.5])),
      lantern: partsToGeometry(lantern().mesh(LANTERN_SCALE)),
      chandelier: partsToGeometry(chandelier().mesh(CHANDELIER_SCALE)),
    }
    const parts = { link: [] as Part[], lantern: [] as Part[], chandelier: [] as Part[] }
    const step = CHAIN_STEP_PX * CHAIN_SCALE
    for (const l of hall.lanterns) {
      if (!l.anchor) continue
      const drop = l.anchor[1] - l.position[1]
      const n = Math.max(1, Math.floor(drop / step))
      for (let k = 0; k < n; k++) {
        parts.link.push({ owner: l.id, local: new Matrix4().makeRotationY(k % 2 ? Math.PI / 2 : 0).setPosition(0, -k * step, 0) })
      }
      if (l.kind === 'chandelier') parts.chandelier.push({ owner: l.id, local: new Matrix4().makeTranslation(0, -drop, 0) })
      else parts.lantern.push({ owner: l.id, local: new Matrix4().makeTranslation(0, -drop - LANTERN_PX_H * LANTERN_SCALE, 0) })
    }
    return { geos, parts }
  }, [])

  const refs = {
    link: useRef<InstancedMesh>(null),
    lantern: useRef<InstancedMesh>(null),
    chandelier: useRef<InstancedMesh>(null),
  }
  const pivots = useMemo(() => hall.lanterns.map(() => new Matrix4()), [])
  const tmp = useMemo(() => new Matrix4(), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    for (const l of hall.lanterns) pivotMatrix(l, t, pivots[l.id])
    for (const k of ['link', 'lantern', 'chandelier'] as const) {
      const m = refs[k].current
      if (!m) continue
      parts[k].forEach((p, i) => m.setMatrixAt(i, tmp.multiplyMatrices(pivots[p.owner], p.local)))
      m.instanceMatrix.needsUpdate = true
    }
  })

  // Lantern fixtures never cast shadows: their own light sits inside them.
  return (
    <group name="hanging">
      <instancedMesh ref={refs.link} args={[geos.link, materials, parts.link.length]} frustumCulled={false} />
      <instancedMesh ref={refs.lantern} args={[geos.lantern, materials, parts.lantern.length]} frustumCulled={false} />
      <instancedMesh ref={refs.chandelier} args={[geos.chandelier, materials, parts.chandelier.length]} frustumCulled={false} />
    </group>
  )
}
