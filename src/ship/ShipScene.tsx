/**
 * The ship world's lights and static dressing: the sun (one directional shadow map over the deck)
 * with a sky/sea hemisphere fill, the temporary deck and the island. All plain standard materials
 * (none of the hall's light field: its lights live in the hall).
 */
import { useEffect, useMemo } from 'react'
import { DirectionalLight, MeshStandardMaterial, type BufferGeometry } from 'three'
import { OFF } from '../lib/debug'
import { useApp } from '../state/store'
import { DECK, ISLAND, SEA_Y, SUN_DIR } from './constants'
import type { DeckGeometry } from './deck'
import type { DeckTextures } from './textures'

/** Half size of the sun's shadow camera (m): the deck and a margin. */
const SHADOW_HALF = 26

export function ShipLights() {
  const high = useApp((s) => s.quality) === 'high'
  const sun = useMemo(() => {
    const l = new DirectionalLight('#fff3dc', 2.4)
    const cx = 0
    const cz = (DECK.z0 + DECK.z1) / 2
    l.target.position.set(cx, DECK.y, cz)
    l.position.set(cx + SUN_DIR.x * 70, DECK.y + SUN_DIR.y * 70, cz + SUN_DIR.z * 70)
    if (!OFF.has('shadows')) {
      l.castShadow = true
      l.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024)
      const c = l.shadow.camera
      c.left = c.bottom = -SHADOW_HALF
      c.right = c.top = SHADOW_HALF
      c.near = 20
      c.far = 130
      c.updateProjectionMatrix()
      l.shadow.bias = -0.0004
      l.shadow.normalBias = 0.035
      l.shadow.radius = 2
    }
    return l
  }, [high])
  useEffect(() => () => sun.dispose(), [sun])
  return (
    <>
      <hemisphereLight args={['#d6ecff', '#b9aa8a', 2.2]} />
      <primitive object={sun} />
      <primitive object={sun.target} />
    </>
  )
}

export function TempDeck({ geo, tex }: { geo: DeckGeometry; tex: DeckTextures }) {
  const mats = useMemo(
    () => ({
      deck: new MeshStandardMaterial({ map: tex.deck, roughness: 0.88, metalness: 0 }),
      hull: new MeshStandardMaterial({ map: tex.hull, roughness: 0.85, metalness: 0 }),
      rail: new MeshStandardMaterial({ map: tex.rail, roughness: 0.7, metalness: 0 }),
    }),
    [tex],
  )
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  return (
    <group name="temp-deck">
      <mesh geometry={geo.deck} material={mats.deck} receiveShadow castShadow />
      <mesh geometry={geo.hull} material={mats.hull} receiveShadow castShadow />
      <mesh geometry={geo.rail} material={mats.rail} receiveShadow castShadow />
    </group>
  )
}

export function Island({ geometry }: { geometry: BufferGeometry }) {
  const mat = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), [])
  useEffect(() => () => mat.dispose(), [mat])
  // voxel (x, y, z) spans [x, x + 1]: centre the columns on the island's cells; the beach's top
  // voxel (y 0) sits 0.4 m above the mean sea level
  return <mesh geometry={geometry} material={mat} position={[ISLAND.x - 0.5, SEA_Y - 0.6, ISLAND.z - 0.5]} />
}

