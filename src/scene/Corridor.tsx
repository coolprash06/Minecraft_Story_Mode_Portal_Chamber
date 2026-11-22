import { useEffect, useMemo } from 'react'
import { blockMaterial } from '../gfx/materials'
import { cellKey, hall } from '../world/layout'
import { meshGrid, type EmitFn } from '../world/mesher'

/** Portal frame faces carry their portal id (+1), and +0.5 if they line the opening (y/z faces). */
const frameGlow: EmitFn = (x, y, z, axis) => {
  const id = hall.frameOwner.get(cellKey(x, y, z))
  return id === undefined ? 0 : id + 1 + (axis !== 0 ? 0.5 : 0)
}

/** The voxel hall: one merged, frustum-culled mesh per 16-block chunk, all sharing one material. */
export function Corridor() {
  const chunks = useMemo(() => meshGrid(hall.grid, 16, frameGlow), [])
  const material = useMemo(blockMaterial, [])
  useEffect(() => () => chunks.forEach((c) => c.geometry.dispose()), [chunks])
  return (
    <group name="corridor">
      {chunks.map((c) => (
        <mesh key={c.z0} geometry={c.geometry} material={material} receiveShadow castShadow />
      ))}
    </group>
  )
}
