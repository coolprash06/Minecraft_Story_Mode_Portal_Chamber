/**
 * Everything that hangs and sways: chains, hanging lanterns and chandeliers. Each assembly swings
 * rigidly about its beam anchor (world/motion.ts); the light field uses the same motion, so the
 * light moves with the lantern.
 *
 * The chandeliers burn soul fire: their glow voxels use their own material, which breathes with
 * each chandelier's light source and shimmers per voxel (flame pixels only; the glass stays
 * steady). Faint cyan motes drift up off the cages.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial, ShaderMaterial, type Material, type PerspectiveCamera } from 'three'
import { FOG_DENSITY } from '../config/theme'
import { lightField } from '../gfx/lightField'
import { slotMaterials, soulGoldMaterial } from '../gfx/materials'
import { partsToGeometry, SLOT } from '../gfx/voxel'
import { useApp } from '../state/store'
import { hall } from '../world/layout'
import { pivotMatrix } from '../world/motion'
import { CHAIN_SCALE, CHAIN_STEP_PX, chainLink, chandelier, CHANDELIER_SCALE, lantern, LANTERN_PX_H, LANTERN_SCALE, SOUL_CAGE } from './models'

interface Part {
  owner: number
  local: Matrix4
}

const chandelierSources = lightField.sources.filter((s) => s.kind === 'chandelier')
const NC = chandelierSources.length
/** Per-chandelier soul brightness (breathing), indexed like the chandelier instances. */
const soulLevel = { value: new Float32Array(NC).fill(1) }
const soulTime = { value: 0 }

/** Unlit HDR like the shared glow slot, plus a per-voxel flame shimmer. */
function soulMaterial() {
  const m = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1, 1, 1).multiplyScalar(1.7) })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSoulLevel = soulLevel
    sh.uniforms.uSoulTime = soulTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSoulCell;\nvarying float vSoulInst;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // voxel index: face vertices sit on the voxel's outer face, so step half a voxel back in
        vSoulCell = position / ${CHANDELIER_SCALE.toFixed(6)} - normal * 0.5;
        #ifdef USE_INSTANCING
          vSoulInst = float(gl_InstanceID);
        #else
          vSoulInst = 0.0;
        #endif`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSoulLevel[${NC}];
        uniform float uSoulTime;
        varying vec3 vSoulCell;
        varying float vSoulInst;
        float soulHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 cell = floor(vSoulCell);
          // the dark glass has almost no green/blue: only flame pixels shimmer
          float heat = dot(vColor.rgb, vec3(0.25, 0.6, 0.15));
          float flame = smoothstep(0.08, 0.45, heat);
          float frame = floor(uSoulTime * 6.0 + vSoulInst * 0.37);
          float n = soulHash(cell + vec3(vSoulInst * 7.0, frame * 1.618, frame * 0.731));
          float wave = 0.5 + 0.5 * sin(uSoulTime * 2.6 - cell.y * 0.8 + cell.x * 0.5 + cell.z * 0.3 + vSoulInst * 2.3);
          float lv = uSoulLevel[int(vSoulInst + 0.5)];
          diffuseColor.rgb *= lv * mix(1.0, 0.86 + 0.2 * n + 0.12 * wave, flame);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'soul'
  return m
}

/* ───────────────────────────── soul motes ───────────────────────────── */

const MOTES_PER_CAGE = 3
const moteFog = { value: FOG_DENSITY }
const moteScale = { value: 800 }

function moteGeometry() {
  const chandeliers = hall.lanterns.filter((l) => l.kind === 'chandelier')
  const s = CHANDELIER_SCALE
  const pts: number[] = []
  const seeds: number[] = []
  for (const l of chandeliers)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      for (let k = 0; k < MOTES_PER_CAGE; k++) {
        // rest position of the cage top (the sway is centimetres: not worth following)
        pts.push(l.position[0] + dx * SOUL_CAGE.arm * s, l.position[1] + SOUL_CAGE.top * s, l.position[2] + dz * SOUL_CAGE.arm * s)
        seeds.push(Math.random())
      }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
  g.setAttribute('aSeed', new BufferAttribute(new Float32Array(seeds), 1))
  return g
}

const moteMaterial = () =>
  new ShaderMaterial({
    uniforms: { uTime: soulTime, uFog: moteFog, uScale: moteScale },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uFog; uniform float uScale;
      attribute float aSeed;
      varying float vAlpha; varying float vHeat;
      void main() {
        // slow, lazy rise (soul fire is calmer than the torches' embers)
        float life = fract(uTime * (0.12 + aSeed * 0.1) + aSeed * 13.0);
        vec3 p = position;
        p.x += (fract(aSeed * 5.3) - 0.5) * 0.4 + sin(uTime * 0.9 + aSeed * 31.0) * 0.18 * life;
        p.z += (fract(aSeed * 9.7) - 0.5) * 0.4 + cos(uTime * 0.7 + aSeed * 17.0) * 0.18 * life;
        p.y += life * (0.8 + aSeed * 0.7);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, (0.03 * uScale) / -mv.z);
        float f = uFog * -mv.z;
        vAlpha = (1.0 - life) * smoothstep(0.0, 0.15, life) * (0.6 + 0.4 * sin(uTime * 3.0 + aSeed * 50.0)) * exp(-f * f);
        vHeat = 1.0 - life;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha; varying float vHeat;
      void main() {
        if (vAlpha < 0.01) discard;
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.3, d) * vAlpha;
        vec3 col = mix(vec3(0.05, 0.35, 1.0), vec3(0.4, 0.9, 1.0), vHeat);
        gl_FragColor = vec4(col * 1.6 * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })

/* ───────────────────────────── hanging assemblies ───────────────────────────── */

export function Hanging() {
  const high = useApp((s) => s.quality) === 'high'
  const materials = useMemo(slotMaterials, [])
  const soulMaterials = useMemo(() => {
    const m: Material[] = [...materials]
    m[SLOT.metal] = soulGoldMaterial()
    m[SLOT.glow] = soulMaterial()
    return m
  }, [materials])
  const motes = useMemo(() => ({ geo: moteGeometry(), mat: moteMaterial() }), [])
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

  useFrame(({ clock, gl, camera }, dt) => {
    const t = clock.elapsedTime
    for (const l of hall.lanterns) pivotMatrix(l, t, pivots[l.id])
    for (const k of ['link', 'lantern', 'chandelier'] as const) {
      const m = refs[k].current
      if (!m) continue
      parts[k].forEach((p, i) => m.setMatrixAt(i, tmp.multiplyMatrices(pivots[p.owner], p.local)))
      m.instanceMatrix.needsUpdate = true
    }
    // Chandelier instances are in hall.lanterns order, as are their light sources. The visible
    // breathing is the source's flicker, exaggerated a little so the glass reads as alive.
    soulTime.value += dt
    chandelierSources.forEach((s, i) => (soulLevel.value[i] = 1 + (lightField.strength(s) / s.intensity - 0.985) * 3))
    if (high) moteScale.value = gl.domElement.height / (2 * Math.tan((((camera as PerspectiveCamera).fov ?? 60) * Math.PI) / 360))
  })

  // Lantern fixtures never cast shadows: their own light sits inside them.
  return (
    <group name="hanging">
      <instancedMesh ref={refs.link} args={[geos.link, materials, parts.link.length]} frustumCulled={false} />
      <instancedMesh ref={refs.lantern} args={[geos.lantern, materials, parts.lantern.length]} frustumCulled={false} />
      <instancedMesh ref={refs.chandelier} args={[geos.chandelier, soulMaterials, parts.chandelier.length]} frustumCulled={false} />
      {high && <points geometry={motes.geo} material={motes.mat} frustumCulled={false} renderOrder={4} />}
    </group>
  )
}
