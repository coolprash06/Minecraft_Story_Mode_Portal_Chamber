/**
 * Static props, baked into world-space chunk geometry (no per-frame cost, frustum-culled per chunk):
 * torch sticks + brackets, armour stands, pillar weapon displays, weapon racks, banner rods and
 * standing lanterns. Torch heads are a separate instanced mesh so they can flicker and go out.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { lightField } from '../gfx/lightField'
import { slotMaterials } from '../gfx/materials'
import { partsToGeometry, StaticBatch, type MeshParts } from '../gfx/voxel'
import { hall, TORCH, type WeaponKind } from '../world/layout'
import {
  ARMOUR_SCALE,
  armourStand,
  bannerRod,
  FRAME_OPENING,
  FRAME_SCALE,
  ITEM_SCALE,
  lantern,
  LANTERN_SCALE,
  portraitFrame,
  rackFrame,
  RACK_SCALE,
  shield,
  torchBracket,
  torchHead,
  torchStick,
  TORCH_SCALE,
  weapon,
} from './models'

type V3 = [number, number, number]
const UP = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)
const ONE = new Vector3(1, 1, 1)

/** Yaw that turns local +Z to face `n` (horizontal). */
const yawZ = (n: V3) => Math.atan2(n[0], n[2])
/** Yaw that turns local +X to face `n`. */
const yawX = (n: V3) => Math.atan2(-n[2], n[0])

const mat = (pos: V3 | Vector3, yaw: number, extra?: Matrix4) => {
  const m = new Matrix4().compose(pos instanceof Vector3 ? pos : new Vector3(...pos), new Quaternion().setFromAxisAngle(UP, yaw), ONE)
  return extra ? m.multiply(extra) : m
}

/** Rotation about local Z (in the wall plane) then a translation, as one matrix. */
const inPlane = (x: number, y: number, z: number, angle: number) => new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(Z, angle), ONE)

/** The torch's local transform: lean the stick out from the wall (+X) by the tilt angle. */
export const torchLean = () => new Matrix4().makeRotationZ(-TORCH.tilt)

function buildStatic() {
  const casters = new StaticBatch()
  const fixtures = new StaticBatch()

  // torches: stick (leaning) + bracket on the wall
  const stick = torchStick().mesh(TORCH_SCALE)
  const bracket = torchBracket().mesh(TORCH_SCALE)
  for (const t of hall.torches) {
    fixtures.add(stick, mat(t.base, yawX(t.normal), torchLean()))
    fixtures.add(bracket, mat(t.base, yawX(t.normal)))
  }

  // armour stands (one model per finish, reused)
  const stands = { iron: armourStand('iron').mesh(ARMOUR_SCALE), gold: armourStand('gold').mesh(ARMOUR_SCALE), diamond: armourStand('diamond').mesh(ARMOUR_SCALE) }
  for (const a of hall.decor.armourStands) casters.add(stands[a.finish], mat(a.position, yawZ(a.normal)))

  // weapon sprites, centred on their middle (for crossing) and on their foot (for racks)
  const weapons = new Map<WeaponKind, { mid: MeshParts; foot: MeshParts; h: number }>()
  for (const k of ['sword', 'axe', 'spear', 'bow'] as WeaponKind[]) {
    const { set, h } = weapon(k)
    weapons.set(k, { mid: set.mesh(ITEM_SCALE, [0, h / 2, 0.5]), foot: set.mesh(ITEM_SCALE, [0, 0, 0.5]), h })
  }
  const shields = new Map<number, MeshParts>()
  const shieldParts = (crest: number) => {
    let p = shields.get(crest)
    if (!p) {
      const s = shield(crest)
      p = s.set.mesh(ITEM_SCALE * 1.1, [0, s.h / 2, 0])
      shields.set(crest, p)
    }
    return p
  }

  // pillar displays: two weapons crossed behind a shield
  for (const d of hall.decor.displays) {
    const base = mat(d.position, yawZ(d.normal))
    const w = weapons.get(d.weapon)!
    const angle = d.weapon === 'spear' ? 0.62 : 0.72
    casters.add(w.mid, base.clone().multiply(inPlane(0, 0, 0.02, angle)))
    casters.add(w.mid, base.clone().multiply(inPlane(0, 0, 0.1, -angle)))
    casters.add(shieldParts(d.crest), base.clone().multiply(inPlane(0, -0.05, 0.2, 0)))
  }

  // weapon racks
  const frame = rackFrame().mesh(RACK_SCALE)
  const order: WeaponKind[] = ['spear', 'sword', 'axe', 'sword', 'spear', 'axe', 'bow']
  for (const r of hall.decor.racks) {
    const base = mat(r.position, yawZ(r.normal))
    casters.add(frame, base)
    for (let i = 0; i < 5; i++) {
      const kind = order[(r.seed + i) % order.length]
      const lean = new Matrix4().makeRotationX(-0.12)
      const m = base.clone().multiply(new Matrix4().makeTranslation((-10 + i * 5) * RACK_SCALE, 2 * RACK_SCALE, 0.06)).multiply(lean)
      casters.add(weapons.get(kind)!.foot, m)
    }
  }

  // banner rods (the cloth itself is animated, see Banners)
  const rod = bannerRod().mesh(ITEM_SCALE * 0.75)
  for (const b of hall.decor.banners) casters.add(rod, mat(b.position, yawZ(b.normal)))

  // standing lanterns
  const lanterns = new Map<number, MeshParts>()
  for (const l of hall.lanterns) {
    if (l.kind !== 'standing') continue
    const scale = l.scale ?? 1
    if (!lanterns.has(scale)) lanterns.set(scale, lantern().mesh(LANTERN_SCALE * scale))
    fixtures.add(lanterns.get(scale)!, mat(l.position, 0))
  }

  // the Founding King's frame (origin: bottom centre of the outer edge, back on the wall)
  const pf = hall.decor.finale.portrait
  const frameBottom = pf.position[1] - (FRAME_OPENING.h / 2 + FRAME_OPENING.ring) * FRAME_SCALE
  casters.add(portraitFrame().mesh(FRAME_SCALE), mat([pf.position[0], frameBottom, pf.position[2]], yawZ(pf.normal)))

  return { casters: casters.build(), fixtures: fixtures.build() }
}

export function Props() {
  const { casters, fixtures } = useMemo(buildStatic, [])
  const materials = useMemo(slotMaterials, [])
  useEffect(() => () => [...casters, ...fixtures].forEach((g) => g.dispose()), [casters, fixtures])
  return (
    <group name="props">
      {casters.map((g, i) => (
        <mesh key={`c${i}`} geometry={g} material={materials} castShadow receiveShadow />
      ))}
      {/* Fixtures that hold a light never cast shadows (the light would sit inside them). */}
      {fixtures.map((g, i) => (
        <mesh key={`f${i}`} geometry={g} material={materials} receiveShadow />
      ))}
      <TorchHeads />
    </group>
  )
}

/** Glowing torch heads: instanced so each one follows its own flicker / on-off level. */
function TorchHeads() {
  const ref = useRef<InstancedMesh>(null)
  const geo = useMemo<BufferGeometry>(() => partsToGeometry(torchHead().mesh(TORCH_SCALE)), [])
  const materials = useMemo(slotMaterials, [])
  const col = useMemo(() => new Color(), [])
  useEffect(() => {
    const m = ref.current
    if (!m) return
    hall.torches.forEach((t, i) => m.setMatrixAt(i, mat(t.base, yawX(t.normal), torchLean())))
    m.instanceMatrix.needsUpdate = true
    hall.torches.forEach((_, i) => m.setColorAt(i, col.setScalar(1)))
  }, [col])
  useFrame(() => {
    const m = ref.current
    if (!m?.instanceColor) return
    for (const t of hall.torches) {
      const s = lightField.sources[t.id]
      // embers stay faintly visible on a snuffed torch
      const lv = 0.12 + 0.88 * s.level * s.flicker
      m.setColorAt(t.id, col.setRGB(lv, lv * (0.85 + 0.15 * s.level), lv * (0.7 + 0.3 * s.level)))
    }
    m.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, materials, hall.torches.length]} frustumCulled={false} />
}
