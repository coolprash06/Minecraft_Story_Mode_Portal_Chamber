/**
 * LIGHT FIELD: every torch, lantern, chandelier and portal lights the hall, without three.js
 * point lights (each of which would cost every pixel, everywhere, plus a shader recompile whenever
 * the count changed).
 *
 *  • Sources live in a float texture (position + range, colour × intensity), rewritten each frame
 *    (flicker, sway, fades): ~100 lights × 2 texels, trivial to upload.
 *  • A static culling grid over the hall (4 × 3 × 58 cells, 4.5 × 6 × 2 m) lists, per cell, only the sources whose
 *    range sphere (plus sway margin) touches that cell. A fragment looks up its cell and evaluates
 *    that short list, skipping anything out of range before doing any lighting maths.
 *  • Falloff is three's own windowed inverse-square (exactly zero at the range), and the grid is
 *    conservative, so no light ever pops at a range edge or a cell border.
 *  • Lighting goes through three's RE_Direct, so the field and the real (shadow-casting) pool lights
 *    match exactly. That's what lets the shadow pool hand a source over without a visible jump.
 */
import {
  Color,
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  Matrix4,
  Vector3,
  type MeshStandardMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { PORTAL_COLORS } from '../config/portals'
import { COLORS } from '../config/theme'
import { portalFx } from './portalFx'
import { OFF } from '../lib/debug'
import { appStore, isLit } from '../state/store'
import { hall, HALL, type LanternInfo } from '../world/layout'
import { lanternFlicker, pivotMatrix, soulFlicker, torchFlicker } from '../world/motion'

export type SourceKind = 'torch' | 'lantern' | 'chandelier' | 'portal'

export interface LightSource {
  index: number
  kind: SourceKind
  /** torch / lantern / portal id in the layout. */
  owner: number
  /** Current world position (sway applied). */
  pos: Vector3
  /** Pivot-local offset for hanging sources (null = fixed at pos). */
  local: Vector3 | null
  lantern: LanternInfo | null
  /** Linear colour at intensity 1. */
  color: Color
  /** Peak intensity (candela, as three point lights with decay 2). */
  intensity: number
  range: number
  /** Extra radius for culling (sway). */
  margin: number
  /** On-level 0..1 (fades), driven towards `target`. */
  level: number
  target: number
  /** Fade rate (1/s) towards target. */
  rate: number
  /** Current flicker multiplier. */
  flicker: number
  /** Share (0..1) currently carried by a shadow-pool light instead of the field. */
  shadowWeight: number
  seed: number
}

/* ───────────────────────────── tunables ───────────────────────────── */

export const LIGHT = {
  torch: { color: COLORS.torch, intensity: 9, range: 8.5 },
  // Soul fire: cool and soft. ~40 % of the old warm chandelier on the floor (lower intensity and a
  // tighter range), and cyan carries almost no red, so the carpet and the portal pools keep their colour.
  chandelier: { color: COLORS.soul, intensity: 18, range: 12 },
  hanging: { color: COLORS.lantern, intensity: 9, range: 9 },
  standing: { color: COLORS.lantern, intensity: 7, range: 8 },
  portal: { intensity: 34, range: 12 },
} as const

/** Grid: x columns over [-9, 9], y bands over [-1, 17], z slices over the hall. */
const GRID_MIN = new Vector3(-9, -1, HALL.zFar - 1)
const GRID_CELL = new Vector3(4.5, 6, 2)
const GRID_DIMS = [4, 3, Math.ceil((HALL.zBack + 1 - (HALL.zFar - 1)) / 2)] as const
/** Max sources per cell (4 per texel). */
export const LF_MAX_PER_CELL = 32
const LF_TEXELS = LF_MAX_PER_CELL / 4
const MAX_LIGHTS = 128

/* ───────────────────────────── sources ───────────────────────────── */

function buildSources(): LightSource[] {
  const out: LightSource[] = []
  const add = (s: Omit<LightSource, 'index' | 'level' | 'target' | 'flicker' | 'shadowWeight' | 'rate'> & { level?: number; rate?: number }) => {
    const level = s.level ?? 1
    out.push({ ...s, index: out.length, level, target: level, rate: s.rate ?? 3, flicker: 1, shadowWeight: 0 })
  }
  const lin = (hex: string) => new Color(hex)

  for (const t of hall.torches) {
    const p = new Vector3(...t.position).add(new Vector3(...t.normal).multiplyScalar(0.3))
    p.y += 0.08
    add({ kind: 'torch', owner: t.id, pos: p, local: null, lantern: null, color: lin(LIGHT.torch.color), intensity: LIGHT.torch.intensity, range: LIGHT.torch.range, margin: 0, seed: t.id * 7.31 })
  }

  for (const l of hall.lanterns) {
    const conf = l.kind === 'chandelier' ? LIGHT.chandelier : l.kind === 'hanging' ? LIGHT.hanging : LIGHT.standing
    let local: Vector3 | null = null
    const pos = new Vector3(...l.position)
    if (l.anchor) {
      // light sits at the lantern's centre / just under the chandelier hub, relative to the pivot
      const drop = l.anchor[1] - l.position[1]
      // chandelier: level with its arm lanterns; hanging lantern: its glowing core
      // (soul chandelier: just below the cage floors, clear of the gold hub and finial)
      local = new Vector3(0, -drop - (l.kind === 'chandelier' ? 2.3 : 0.83), 0)
    } else pos.y += 0.95 * (l.scale ?? 1) // just above the cage: no hot spot on the polished floor
    const margin = local ? Math.abs(local.y) * 0.05 + 0.1 : 0
    const boost = l.boost ?? 1
    add({ kind: l.kind === 'chandelier' ? 'chandelier' : 'lantern', owner: l.id, pos, local, lantern: l, color: lin(conf.color), intensity: conf.intensity * boost, range: conf.range * Math.sqrt(boost), margin, seed: l.id * 3.17 })
  }

  const lit = appStore.get().litMask
  for (const p of hall.portals) {
    const pos = new Vector3(...p.center).add(new Vector3(...p.normal).multiplyScalar(1.4))
    pos.y = 2.4
    const on = isLit(lit, p.id) ? 1 : 0
    add({ kind: 'portal', owner: p.id, pos, local: null, lantern: null, color: lin(PORTAL_COLORS[p.color]), intensity: LIGHT.portal.intensity, range: LIGHT.portal.range, margin: 0, seed: p.id, level: on, rate: 0.75 })
  }
  if (out.length > MAX_LIGHTS) throw new Error(`light field: ${out.length} sources > ${MAX_LIGHTS}`)
  return out
}

/* ───────────────────────────── grid ───────────────────────────── */

function buildGrid(sources: LightSource[]) {
  const [nx, ny, nz] = GRID_DIMS
  const cells = nx * ny * nz
  const data = new Float32Array(LF_TEXELS * 4 * cells)
  let maxCount = 0
  let overflow = 0
  const lo = new Vector3()
  const hi = new Vector3()
  const q = new Vector3()
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const cell = (z * ny + y) * nx + x
        lo.set(x, y, z).multiply(GRID_CELL).add(GRID_MIN)
        hi.copy(lo).add(GRID_CELL)
        // edge cells extend to infinity (fragments beyond the grid clamp into them)
        if (x === 0) lo.x = -1e4
        if (x === nx - 1) hi.x = 1e4
        if (y === 0) lo.y = -1e4
        if (y === ny - 1) hi.y = 1e4
        if (z === 0) lo.z = -1e4
        if (z === nz - 1) hi.z = 1e4
        const hits: { i: number; score: number }[] = []
        for (const s of sources) {
          const r = s.range + s.margin
          q.copy(s.pos).clamp(lo, hi)
          const d2 = q.distanceToSquared(s.pos)
          if (d2 < r * r) hits.push({ i: s.index, score: s.intensity / Math.max(d2, 1) })
        }
        maxCount = Math.max(maxCount, hits.length)
        if (hits.length > LF_MAX_PER_CELL) {
          overflow++
          hits.sort((a, b) => b.score - a.score)
          hits.length = LF_MAX_PER_CELL
        }
        hits.forEach((h, k) => (data[cell * LF_TEXELS * 4 + k] = h.i + 1))
      }
  const tex = new DataTexture(data, LF_TEXELS, cells, RGBAFormat, FloatType)
  tex.magFilter = tex.minFilter = NearestFilter
  tex.needsUpdate = true
  console.info(`[light field] ${sources.length} sources, ${cells} cells, max ${maxCount}/cell (budget ${LF_MAX_PER_CELL})${overflow ? `, ${overflow} cells TRIMMED` : ''}`)
  return { tex, maxCount }
}

/* ───────────────────────────── runtime ───────────────────────────── */

class LightField {
  readonly sources = buildSources()
  readonly grid = buildGrid(this.sources)
  private readonly buf = new Float32Array(MAX_LIGHTS * 2 * 4)
  readonly dataTex = new DataTexture(this.buf, MAX_LIGHTS, 2, RGBAFormat, FloatType)
  /** Shared uniform objects: every patched material references these. */
  readonly uniforms = {
    lfData: { value: this.dataTex },
    lfGrid: { value: this.grid.tex },
    lfMin: { value: GRID_MIN },
    lfCell: { value: GRID_CELL },
  }
  /** Per-portal on-level (0..1) and colour, shared by the portal surfaces and the frame glow. */
  readonly portalLevels = { value: new Float32Array(hall.portals.length) }
  readonly portalColors = { value: hall.portals.map((p) => new Color(PORTAL_COLORS[p.color])) }
  private readonly m = new Matrix4()
  /** Every patched material (the ambient environment is assigned to each, with its own strength). */
  readonly materials: MeshStandardMaterial[] = []

  constructor() {
    this.dataTex.magFilter = this.dataTex.minFilter = NearestFilter
    this.update(0, 0)
  }

  /** Effective intensity right now (eased level × flicker), before the shadow-pool split. */
  strength(s: LightSource) {
    const lv = s.level * s.level * (3 - 2 * s.level)
    return s.intensity * lv * s.flicker
  }

  update(t: number, dt: number) {
    const st = appStore.get()
    for (const s of this.sources) {
      // targets
      if (s.kind === 'torch') s.target = st.torchesOn ? 1 : 0
      else if (s.kind === 'portal') s.target = isLit(st.litMask, s.owner) && !OFF.has('portallight') ? 1 : 0
      if (s.level !== s.target) {
        const step = s.rate * dt
        s.level = s.level < s.target ? Math.min(s.target, s.level + step) : Math.max(s.target, s.level - step)
      }
      // flicker + sway
      s.flicker =
        s.kind === 'torch'
          ? torchFlicker(s.seed, t)
          : s.kind === 'portal'
            ? (0.94 + 0.06 * Math.sin(t * 1.7 + s.seed)) * (1 + 0.35 * portalFx.spiral[s.owner])
            : s.kind === 'chandelier'
              ? soulFlicker(s.seed, t)
              : lanternFlicker(s.seed, t)
      if (s.local && s.lantern) s.pos.copy(s.local).applyMatrix4(pivotMatrix(s.lantern, t, this.m))

      if (s.kind === 'portal') this.portalLevels.value[s.owner] = s.level

      const i = s.index * 4
      const k = (MAX_LIGHTS + s.index) * 4
      this.buf[i] = s.pos.x
      this.buf[i + 1] = s.pos.y
      this.buf[i + 2] = s.pos.z
      this.buf[i + 3] = s.range
      const e = this.strength(s) * (1 - s.shadowWeight)
      this.buf[k] = s.color.r * e
      this.buf[k + 1] = s.color.g * e
      this.buf[k + 2] = s.color.b * e
      this.buf[k + 3] = e
    }
    this.dataTex.needsUpdate = true
  }

  /**
   * Make a MeshStandardMaterial receive the field. `vertex` (optional) is GLSL inserted after
   * <begin_vertex> to deform `transformed` (e.g. banner cloth), with its own uniforms.
   * `fragment` (optional) runs after <emissivemap_fragment> and may add to totalEmissiveRadiance.
   */
  patch<M extends MeshStandardMaterial>(
    material: M,
    opts: {
      key?: string
      vertex?: string
      vertexHead?: string
      fragment?: string
      fragmentHead?: string
      uniforms?: Record<string, { value: unknown }>
      env?: number
      /** Scales every field light on this material (1 = physical). */
      fieldGain?: number
    } = {},
  ): M {
    const u = this.uniforms
    material.userData.envIntensity = opts.env ?? 0.25
    this.materials.push(material)
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, u, opts.uniforms ?? {})
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vLfWorld;\n${opts.vertexHead ?? ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${opts.vertex ?? ''}`)
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          {
            vec4 lfW = vec4( transformed, 1.0 );
            #ifdef USE_INSTANCING
              lfW = instanceMatrix * lfW;
            #endif
            vLfWorld = ( modelMatrix * lfW ).xyz;
          }`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vLfWorld;
          uniform highp sampler2D lfData;
          uniform highp sampler2D lfGrid;
          uniform vec3 lfMin;
          uniform vec3 lfCell;
          ${opts.fragmentHead ?? ''}`,
        )
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${opts.fragment ?? ''}`)
        .replace('#include <lights_fragment_end>', `${fieldGlsl(opts.fieldGain ?? 1)}\n#include <lights_fragment_end>`)
    }
    material.customProgramCacheKey = () => `lightfield:${opts.key ?? ''}:${opts.fieldGain ?? 1}`
    return material
  }
}

const fieldGlsl = (gain: number) => /* glsl */ `
{
  const ivec3 lfDims = ivec3(${GRID_DIMS[0]}, ${GRID_DIMS[1]}, ${GRID_DIMS[2]});
  ivec3 lfC = clamp(ivec3(floor((vLfWorld - lfMin) / lfCell)), ivec3(0), lfDims - 1);
  int lfCellIdx = (lfC.z * lfDims.y + lfC.y) * lfDims.x + lfC.x;
  bool lfDone = false;
  for (int t = 0; t < ${LF_TEXELS}; t++) {
    if (lfDone) break;
    vec4 ids = texelFetch(lfGrid, ivec2(t, lfCellIdx), 0);
    for (int k = 0; k < 4; k++) {
      float id = ids[k];
      if (id < 0.5) { lfDone = true; break; }
      int li = int(id) - 1;
      vec4 lfCol = texelFetch(lfData, ivec2(li, 1), 0);
      if (lfCol.a < 1e-4) continue;
      vec4 lfPR = texelFetch(lfData, ivec2(li, 0), 0);
      vec3 toL = lfPR.xyz - vLfWorld;
      float d2 = dot(toL, toL);
      if (d2 >= lfPR.w * lfPR.w) continue;
      float d = sqrt(d2);
      IncidentLight lfL;
      lfL.direction = normalize((viewMatrix * vec4(toL, 0.0)).xyz);
      lfL.color = lfCol.rgb * (getDistanceAttenuation(d, lfPR.w, 2.0) * ${gain.toFixed(4)});
      lfL.visible = true;
      RE_Direct(lfL, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
  }
}
`

export const lightField = new LightField()

/** Patch helper for materials created in components. */
export const withLightField = <M extends MeshStandardMaterial>(m: M, opts?: Parameters<LightField['patch']>[1]) => lightField.patch(m, opts)

