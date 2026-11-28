/**
 * A posed pirate: the voxel parts in a pivot hierarchy, driven every frame by a PirateAnimator.
 *   root (feet) ─ body (hips) ─ head (neck), armL, armR (shoulders)
 *              └ legL, legR (hips)
 * Plus the death puff: pixel smoke cubes (one InstancedMesh, idle until a death).
 * Materials are plain lit standard materials (this is not used inside the hall's light field).
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Vector3, type Group, type Mesh } from 'three'
import type { PirateDef } from '../config/pirates'
import { mulberry32 } from '../lib/random'
import type { PirateAnimator } from './pirateAnims'
import { buildPirate, disposePirate, type Eyes } from './pirateModel'

/** Material per voxel slot (matte, metal, glow, gem); the lit ones take the hurt flash. */
function pirateMaterials() {
  const matte = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  const metal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.85 })
  const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2.1, 2.1, 2.1) })
  const gem = new MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.3 })
  return { list: [matte, metal, glow, gem], lit: [matte, metal, gem] }
}

const FLASH = new Color(0.95, 0.06, 0.04)
const EYES: Eyes[] = ['open', 'narrow', 'closed']

export function PirateRig({ def, animator }: { def: PirateDef; animator: PirateAnimator }) {
  const model = useMemo(() => buildPirate(def), [def])
  const mats = useMemo(pirateMaterials, [])
  useEffect(() => () => disposePirate(model), [model])
  useEffect(() => () => mats.list.forEach((m) => m.dispose()), [mats])

  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const heads = useRef<(Mesh | null)[]>([])
  const smoke = useSmoke()
  useEffect(() => () => smoke.dispose(), [smoke])

  useEffect(() => {
    const at = new Vector3()
    animator.onPuff = () => {
      // the body's centre, in the rig's parent space, at the moment it vanishes
      const r = root.current
      const b = body.current
      if (!r || !b || !r.parent) return
      b.getWorldPosition(at)
      r.parent.worldToLocal(at)
      smoke.burst(at, def.build.scale)
    }
    return () => {
      animator.onPuff = null
    }
  }, [animator, smoke, def])

  const { pivots: P } = model
  const scale = def.build.scale

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    animator.update(dt)
    smoke.tick(dt)
    const p = animator.pose
    const r = root.current
    if (!r || !body.current || !head.current || !armL.current || !armR.current || !legL.current || !legR.current) return
    r.visible = !p.hidden
    r.position.set(0, p.rootY * scale, p.rootZ)
    r.rotation.set(p.rootRX, 0, p.rootRZ)
    r.scale.setScalar(scale * p.scale)
    body.current.rotation.set(p.bodyRX, p.bodyRY, 0)
    head.current.rotation.set(p.headRX, p.headRY, 0, 'YXZ')
    armL.current.rotation.set(p.armLX, 0, p.armLZ)
    armR.current.rotation.set(p.armRX, 0, p.armRZ)
    legL.current.rotation.set(p.legLX, 0, 0)
    legR.current.rotation.set(p.legRX, 0, 0)
    heads.current.forEach((h, i) => h && (h.visible = EYES[i] === p.eyes))
    for (const m of mats.lit) m.emissive.copy(FLASH).multiplyScalar(p.flash * 0.85)
  })

  const rel = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

  return (
    <>
      <group ref={root}>
        <group ref={body} position={P.hip}>
          <mesh geometry={model.torso} material={mats.list} castShadow receiveShadow />
          <group ref={head} position={rel(P.neck, P.hip)}>
            {EYES.map((e, i) => (
              <mesh key={e} ref={(m) => void (heads.current[i] = m)} geometry={model.head[e]} material={mats.list} castShadow receiveShadow visible={i === 0} />
            ))}
          </group>
          <group ref={armL} position={rel(P.shoulderL, P.hip)}>
            <mesh geometry={model.armL} material={mats.list} castShadow receiveShadow />
          </group>
          <group ref={armR} position={rel(P.shoulderR, P.hip)}>
            <mesh geometry={model.armR} material={mats.list} castShadow receiveShadow />
          </group>
        </group>
        <group ref={legL} position={P.legL}>
          <mesh geometry={model.legL} material={mats.list} castShadow receiveShadow />
        </group>
        <group ref={legR} position={P.legR}>
          <mesh geometry={model.legR} material={mats.list} castShadow receiveShadow />
        </group>
      </group>
      <primitive object={smoke.mesh} />
    </>
  )
}

/* ───────────────────────────── death puff ───────────────────────────── */

const PUFFS = 36

/** Pixel smoke: grey cubes that burst out, drift up, and shrink away. Always mounted, idle. */
function useSmoke() {
  return useMemo(() => {
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ roughness: 1, color: '#ffffff' }), PUFFS)
    mesh.frustumCulled = false
    const pos = Array.from({ length: PUFFS }, () => new Vector3())
    const vel = Array.from({ length: PUFFS }, () => new Vector3())
    const life = new Float32Array(PUFFS)
    const max = new Float32Array(PUFFS)
    const size = new Float32Array(PUFFS)
    const o = new Object3D()
    const c = new Color()
    let alive = 0
    const hide = () => {
      o.scale.setScalar(0)
      o.updateMatrix()
      for (let i = 0; i < PUFFS; i++) mesh.setMatrixAt(i, o.matrix)
      mesh.instanceMatrix.needsUpdate = true
    }
    hide()
    for (let i = 0; i < PUFFS; i++) mesh.setColorAt(i, c.set('#ffffff'))
    const tick = (dt: number) => {
      if (alive <= 0) return
      alive = 0
      for (let i = 0; i < PUFFS; i++) {
        if (life[i] <= 0) {
          o.scale.setScalar(0)
        } else {
          life[i] -= dt
          alive++
          vel[i].multiplyScalar(Math.exp(-3.2 * dt))
          vel[i].y += 0.9 * dt
          pos[i].addScaledVector(vel[i], dt)
          const k = Math.max(0, life[i] / max[i])
          o.position.copy(pos[i])
          // grows a little, then shrinks away (no transparency: stays one cheap opaque draw)
          o.scale.setScalar(size[i] * Math.min(1, (1 - k) * 6) * k ** 0.6)
          o.rotation.set(0, 0, 0)
        }
        o.updateMatrix()
        mesh.setMatrixAt(i, o.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (!alive) hide()
    }
    const rnd = mulberry32(7)
    const burst = (at: Vector3, s: number) => {
      for (let i = 0; i < PUFFS; i++) {
        pos[i].set(at.x + (rnd() - 0.5) * 0.5 * s, at.y + (rnd() - 0.3) * 0.5 * s, at.z + (rnd() - 0.5) * 0.5 * s)
        vel[i].set((rnd() - 0.5) * 1.6, 0.3 + rnd() * 1.0, (rnd() - 0.5) * 1.6).multiplyScalar(s)
        max[i] = life[i] = 0.7 + rnd() * 0.7
        size[i] = (0.07 + rnd() * 0.09) * s
        const g = 0.62 + rnd() * 0.35
        mesh.setColorAt(i, c.setRGB(g, g, g * 1.03))
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      alive = PUFFS
    }
    const dispose = () => {
      mesh.geometry.dispose()
      ;(mesh.material as MeshStandardMaterial).dispose()
    }
    return { mesh, burst, tick, dispose }
  }, [])
}
