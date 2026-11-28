/**
 * ?showcase=pirates: the Mission 1 crew on a small lit stage, one at a time, on a slow turntable
 * (drag to rotate). ←/→ switch pirate, 1–7 play the animations. Lazy-loaded by App only for
 * ?showcase, so none of this code, geometry or GPU state exists in the hall.
 *
 * Extra flags (screenshots): &pirate=1..6 or an id (e.g. pirate=bess), &anim=<name>,
 * &still (no turntable), &turn=<deg> (starting turn, 0 = facing the camera).
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Color, MeshBasicMaterial, MeshStandardMaterial, PMREMGenerator, type Group, type PerspectiveCamera, type PointLight, type SpotLight } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { PIRATES, PIRATES_PASSIVE } from '../config/pirates'
import { COLORS } from '../config/theme'
import { ANIMS, PirateAnimator, type AnimName } from '../characters/pirateAnims'
import { PirateRig } from '../characters/PirateRig'
import { banner, PLINTH_H, plinth, stageRoom, torch } from './stage'

const params = new URLSearchParams(window.location.search)

function initialIndex() {
  const p = params.get('pirate')
  if (!p) return 0
  const n = Number(p)
  if (Number.isInteger(n) && n >= 1 && n <= PIRATES.length) return n - 1
  const i = PIRATES.findIndex((d) => d.id === p)
  return i < 0 ? 0 : i
}

/** Turntable state, shared by the drag handlers and the frame loop (never React state). */
interface Spin {
  yaw: number
  vel: number
  dragging: boolean
  /** performance.now() of the last drag release: the auto-turn resumes a moment later. */
  released: number
}

const AUTO_SPEED = 0.32 // rad/s
const STILL = params.has('still')

export default function PirateShowcase() {
  const [index, setIndex] = useState(initialIndex)
  const [anim, setAnim] = useState<AnimName>('idle')
  const animator = useMemo(() => new PirateAnimator(), [])
  const spin = useRef<Spin>({ yaw: ((Number(params.get('turn')) || 0) * Math.PI) / 180, vel: 0, dragging: false, released: 0 })
  const def = PIRATES[index]

  useEffect(() => {
    animator.onChange = setAnim
    return () => {
      animator.onChange = null
    }
  }, [animator])

  // switching pirate starts it fresh in idle; &anim= applies until the first switch
  const switched = useRef(false)
  useEffect(() => {
    animator.reset()
    const a = params.get('anim') as AnimName | null
    if (!switched.current && a && ANIMS.some((x) => x.id === a)) animator.play(a, true)
  }, [index, animator])
  // only touches a ref and the state setter, so the key handler may keep the first instance
  const switchBy = (d: number) => {
    switched.current = true
    setIndex((i) => (i + d + PIRATES.length) % PIRATES.length)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === 'ArrowRight') switchBy(1)
      else if (e.key === 'ArrowLeft') switchBy(-1)
      else {
        const k = Number(e.key)
        if (Number.isInteger(k) && k >= 1 && k <= ANIMS.length) animator.play(ANIMS[k - 1].id, true)
        else return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [animator])

  useEffect(() => {
    document.title = `${def.name} · Pirate Showcase`
  }, [def])

  // drag to rotate (with a little inertia)
  const drag = useRef({ x: 0, t: 0, id: -1 })
  const onDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, t: performance.now(), id: e.pointerId }
    spin.current.dragging = true
    spin.current.vel = 0
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!spin.current.dragging || e.pointerId !== drag.current.id) return
    const now = performance.now()
    const d = (e.clientX - drag.current.x) * 0.009
    spin.current.yaw += d
    spin.current.vel = d / Math.max(0.008, (now - drag.current.t) / 1000)
    drag.current.x = e.clientX
    drag.current.t = now
  }
  const onUp = (e: ReactPointerEvent) => {
    if (e.pointerId !== drag.current.id) return
    spin.current.dragging = false
    spin.current.released = performance.now()
    if (performance.now() - drag.current.t > 80) spin.current.vel = 0
  }

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#05060c]">
      <div className="absolute inset-0 cursor-grab active:cursor-grabbing" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <Canvas
          className="!fixed inset-0"
          dpr={Math.min(window.devicePixelRatio || 1, 1.5)}
          shadows="percentage"
          gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
          camera={{ fov: 30, near: 0.1, far: 40, position: [0, 1.55, 7] }}
        >
          <color attach="background" args={[COLORS.fog]} />
          <fogExp2 attach="fog" args={[COLORS.fog, 0.06]} />
          <Environment />
          <CameraFit />
          <StageLights />
          <Stage />
          <Turntable spin={spin}>
            <PirateRig key={def.id} def={def} animator={animator} />
          </Turntable>
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.55} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            <Vignette offset={0.28} darkness={0.72} />
          </EffectComposer>
        </Canvas>
      </div>
      <ShowcaseUi index={index} switchBy={switchBy} anim={anim} play={(a) => animator.play(a, true)} />
    </div>
  )
}

/* ───────────────────────────── scene ───────────────────────────── */

/** A soft procedural environment (no downloads) so metal and gems have something to reflect. */
function Environment() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.22
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

/** Keeps the whole pirate (hat included) in frame at any aspect ratio. */
function CameraFit() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const aspect = useThree((s) => s.size.width / s.size.height)
  useEffect(() => {
    // the bottom ~quarter of the screen is UI: aim low so the plinth sits just above it
    const dist = 7 * Math.max(1, 1.15 / aspect)
    camera.position.set(0, 1.55, dist)
    camera.lookAt(0, 0.98, 0)
    camera.updateProjectionMatrix()
  }, [camera, aspect])
  return null
}

function StageLights() {
  const key = useRef<SpotLight>(null)
  const torchL = useRef<PointLight>(null)
  const torchR = useRef<PointLight>(null)
  useEffect(() => {
    const k = key.current
    if (!k) return
    k.target.position.set(0, 0.9, 0)
    k.target.updateMatrixWorld()
  }, [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (torchL.current) torchL.current.intensity = 5 * (0.88 + 0.08 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 23.7))
    if (torchR.current) torchR.current.intensity = 5 * (0.88 + 0.08 * Math.sin(t * 8.3 + 2) + 0.05 * Math.sin(t * 21.1 + 1))
  })
  return (
    <>
      <hemisphereLight args={[COLORS.ambient, COLORS.ambientGround, 0.9]} />
      <spotLight
        ref={key}
        position={[1.7, 3.6, 3.4]}
        angle={0.48}
        penumbra={0.65}
        intensity={70}
        color="#ffe2bd"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* cool fill from the left, soul-fire rim from behind */}
      <pointLight position={[-2.6, 1.8, 2.4]} intensity={6} distance={9} color="#8aa2e0" />
      <pointLight position={[-0.5, 2.4, -0.7]} intensity={3} distance={2.6} color={COLORS.soul} />
      <pointLight position={[0.55, 2.0, -0.7]} intensity={2} distance={2.6} color={COLORS.soul} />
      <pointLight ref={torchL} position={[-2.3, 2.3, -1.72]} distance={5} color={COLORS.torch} />
      <pointLight ref={torchR} position={[2.3, 2.3, -1.72]} distance={5} color={COLORS.torch} />
    </>
  )
}

function useStageMaterials() {
  return useMemo(() => {
    const matte = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
    const metal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.8 })
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(2.1, 2.1, 2.1) })
    return [matte, metal, glow, metal]
  }, [])
}

function Stage() {
  const mats = useStageMaterials()
  const geo = useMemo(() => ({ room: stageRoom(), banner: banner(), torch: torch() }), [])
  useEffect(
    () => () => {
      geo.room.dispose()
      geo.banner.dispose()
      geo.torch.body.dispose()
      geo.torch.head.dispose()
      new Set(mats).forEach((m) => m.dispose())
    },
    [geo, mats],
  )
  return (
    <group>
      <mesh geometry={geo.room} material={mats} receiveShadow />
      {[-1.25, 1.25].map((x) => (
        <mesh key={x} geometry={geo.banner} material={mats} position={[x, 1.25, -2.0]} receiveShadow />
      ))}
      {[-2.3, 2.3].map((x) => (
        <group key={x} position={[x, 1.75, -2.0]}>
          <mesh geometry={geo.torch.body} material={mats} />
          <mesh geometry={geo.torch.head} material={mats} />
        </group>
      ))}
    </group>
  )
}

/** The plinth and the pirate on it, turning slowly; drags add to the turn. */
function Turntable({ spin, children }: { spin: RefObject<Spin>; children: ReactNode }) {
  const group = useRef<Group>(null)
  const mats = useStageMaterials()
  const geo = useMemo(plinth, [])
  useEffect(
    () => () => {
      geo.dispose()
      new Set(mats).forEach((m) => m.dispose())
    },
    [geo, mats],
  )
  useFrame((_, delta) => {
    const s = spin.current
    const dt = Math.min(delta, 0.05)
    if (!s.dragging) {
      // drag inertia, then the auto-turn eases back in
      s.yaw += s.vel * dt
      s.vel *= Math.exp(-4 * dt)
      const since = (performance.now() - s.released) / 1000
      if (!STILL) s.yaw += AUTO_SPEED * dt * Math.min(1, Math.max(0, since - 1.2))
    }
    if (group.current) group.current.rotation.y = s.yaw
  })
  return (
    <group ref={group}>
      <mesh geometry={geo} material={mats} receiveShadow castShadow />
      <group position={[0, PLINTH_H, 0]}>{children}</group>
    </group>
  )
}

/* ───────────────────────────── UI ───────────────────────────── */

function ShowcaseUi({ index, switchBy, anim, play }: { index: number; switchBy: (d: number) => void; anim: AnimName; play: (a: AnimName) => void }) {
  const def = PIRATES[index]
  const shadow = { textShadow: '2px 2px 0 #000' }
  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <div className="absolute left-4 top-4 flex flex-col gap-2 sm:left-6 sm:top-6">
        <a href="./" className="pointer-events-auto font-pixel text-[10px] tracking-[0.2em] text-[#e9e6f2]/70 hover:text-[#e9e6f2] sm:text-xs" style={shadow}>
          ‹ THE HALL OF PORTALS
        </a>
        <span className="w-fit border-2 border-black/60 bg-black/45 px-2 py-1 font-pixel text-[9px] tracking-widest text-[#ffd27a]">PIRATE SHOWCASE</span>
        <span className="font-term text-lg tracking-wider text-[#9a96ad]" style={shadow}>
          Mission I · Pirates in the Caribbean
        </span>
      </div>

      {PIRATES_PASSIVE && (
        <div className="absolute right-4 top-4 max-w-[15rem] border-2 border-black/60 bg-black/45 px-3 py-2 text-right sm:right-6 sm:top-6">
          <p className="font-pixel text-[9px] tracking-widest text-[#7dff9a]">PASSIVE MODE</p>
          <p className="mt-1 font-term text-base leading-tight text-[#e9e6f2]/70">Pirates never turn hostile. Hostile animations play only from these buttons.</p>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-3 px-4 sm:bottom-6">
        <div className="flex items-center gap-3 sm:gap-5">
          <ArrowBtn label="Previous pirate" onClick={() => switchBy(-1)}>
            ‹
          </ArrowBtn>
          <div className="min-w-[16rem] border-2 border-black/70 bg-[#0b0d16]/80 px-4 py-3 text-center sm:min-w-[24rem]">
            <p className="font-pixel text-[10px] leading-relaxed tracking-[0.12em] text-[#ffd27a] sm:text-sm" style={shadow}>
              {def.name}
            </p>
            <p className="mt-1 font-term text-xl tracking-wider text-[#e9e6f2]" style={shadow}>
              {def.role} <span className="text-[#9a96ad]">· {def.post}</span>
            </p>
            <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
              {PIRATES.map((p, i) => (
                <span key={p.id} className={`h-1.5 w-3 ${i === index ? 'bg-[#ffd27a]' : 'bg-[#e9e6f2]/20'}`} />
              ))}
            </div>
          </div>
          <ArrowBtn label="Next pirate" onClick={() => switchBy(1)}>
            ›
          </ArrowBtn>
        </div>

        <div className="pointer-events-auto flex max-w-full flex-wrap justify-center gap-1.5 sm:gap-2">
          {ANIMS.map((a, i) => {
            const on = a.id === anim
            const glow = a.hostile ? '#ff5a4a' : '#ffd27a'
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => play(a.id)}
                className={`dim-btn border-2 border-black/70 px-2.5 py-2 font-pixel text-[9px] tracking-wider sm:px-3 sm:text-[10px] ${on ? 'bg-[#3a2a12] text-[#ffd27a]' : a.hostile ? 'bg-[#2a1414] text-[#ff9a8a]' : 'bg-[#1a1c28] text-[#e9e6f2]'}`}
                style={{ ['--glow' as string]: glow }}
              >
                <span className="mr-1.5 text-[#9a96ad]">{i + 1}</span>
                {a.label.toUpperCase()}
              </button>
            )
          })}
        </div>
        <p className="font-term text-lg tracking-wider text-[#e9e6f2]/55" style={shadow}>
          ← → switch pirate · 1–7 animate · drag to rotate
        </p>
      </div>
    </div>
  )
}

function ArrowBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="dim-btn pointer-events-auto border-2 border-black/70 bg-[#1a1c28] px-3 py-3 font-pixel text-sm text-[#ffd27a] sm:px-4"
      style={{ ['--glow' as string]: '#ffd27a' }}
    >
      {children}
    </button>
  )
}
