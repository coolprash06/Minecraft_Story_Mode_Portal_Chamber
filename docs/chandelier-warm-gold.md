# Warm gold chandeliers (previous design)

The ceiling chandeliers originally burned **warm**, like every other light in the hall. They were
replaced by the **soul-fire** design (cyan flames in dark iron cages), which is the version live in
the code now. This page keeps the warm design on record so it can be restored.

- **Last commit with the warm design:** `bfb2525` ("Phase 1-2 + fixes: voxel hall, lighting, royal
  decor, finale portrait, camera-relative glide").
- **Every code block below is copied verbatim from that commit** with `git show bfb2525:<file>`.
  Nothing was retyped.

## What the warm design looked like

- **Frames:** gold (`#e0b13e`, `#c9952c`, `#f0c95a`): a hook, a banded stem, a hub with four ruby
  studs, a finial, four arms and a square ring. The frame was **unchanged** by the soul-fire work.
- **Lanterns:** four small arm-end lanterns, each a 2 × 5 × 2 px warm glowing core (`#ffe6a8`,
  `#ffcf7a`, `#ffbf62`) inside four gold corner posts, with gold top and bottom plates. All the
  metal used the shared `metal` slot material, so the frame took the full light field.
- **Light:** colour `COLORS.lantern` = `#ffc982` (the same warm amber as the other lanterns),
  intensity **36**, range **15** m. The source sat 1.45 m below the chandelier origin, level with
  the arm lanterns, and breathed with `lanternFlicker` (about ±2.5 %).
- **Shadows:** chandeliers **were eligible for the shadow pool** (the 2 shadow-casting lights on
  High), on the same score as every other source: strength ÷ distance², weighted by facing.
- **Particles:** the dust was warm everywhere (`#ffd9a8`, no change with height). There were no
  particles at the chandeliers themselves; the only embers were the orange ones rising from the
  wall torches (`Flames.tsx`, which the soul-fire change did not touch).
- **Unchanged by either design:** the chandelier positions and chain drops in `layout.ts`, the
  sway in `motion.ts` (`swayAngles`), the wall torches, the hanging and standing lanterns, and the
  warm overhead box in the environment map (`Lighting.tsx`).

## Previous code, file by file

The soul-fire change touched eight files. `layout.ts` was not changed; its chandelier entry is
included for reference.

### 1. `src/scene/models.ts`: the chandelier and its arm lanterns

`lantern()` (the hanging and standing lanterns) was **not** changed. Only `chandelier()` was. The
soul-fire version replaces the arm-lantern loop at the end with `soulCage()` calls and adds
`SOUL_CAGE`, `SOUL`, `SOUL_PANE` and `soulCage()` after it.

From `src/scene/models.ts`, lines 83–120 at `bfb2525`:

````ts
/* ───────────────────────────── chandelier ───────────────────────────── */

export const CHANDELIER_SCALE = 0.094
/** Gold chandelier with four arm lanterns; origin at the top (chain end), hanging down −Y. */
export function chandelier() {
  const v = new VoxelSet()
  const GOLD = ['#e0b13e', '#c9952c', '#f0c95a']
  const gold = (x: number, y: number, z: number) => pick(GOLD, x, y, z, 6)
  v.box(-1, -2, -1, 1, 0, 1, gold, SLOT.metal) // hook
  v.box(-1, -10, -1, 1, -2, 1, (x, y, z) => (y % 3 === 0 ? '#f0c95a' : gold(x, y, z)), SLOT.metal) // stem
  v.box(-2, -13, -2, 2, -10, 2, gold, SLOT.metal) // hub
  for (const [x, z] of [[-2, -1], [1, -1], [-1, -2], [-1, 1]]) v.set(x, -12, z, '#c0263a', SLOT.gem) // ruby studs
  v.box(-1, -16, -1, 1, -13, 1, gold, SLOT.metal) // finial
  v.set(0, -17, 0, '#f0c95a', SLOT.metal)
  // arms + a square ring at radius 8
  for (let r = 2; r <= 12; r++) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      v.set(dx * r - (dx < 0 ? 1 : 0), -12, dz * r - (dz < 0 ? 1 : 0), gold(r, 0, dx + dz), SLOT.metal)
    }
  }
  for (let i = -8; i < 8; i++) for (const e of [-9, 8]) {
    v.set(i, -12, e, gold(i, 1, e), SLOT.metal)
    v.set(e, -12, i, gold(e, 1, i), SLOT.metal)
  }
  // arm-end lanterns (4 × 6 px) hanging just under each arm tip
  const GLOW = ['#ffe6a8', '#ffcf7a', '#ffbf62']
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = dx * 12 - (dx < 0 ? 1 : 0)
    const cz = dz * 12 - (dz < 0 ? 1 : 0)
    const ox = cx - 1 - (dx === 0 ? 0 : 0)
    const oz = cz - 1
    v.box(ox - 1, -14, oz - 1, ox + 3, -13, oz + 3, gold, SLOT.metal)
    v.box(ox, -19, oz, ox + 2, -14, oz + 2, (x, y, z) => pick(GLOW, x, y, z, 7), SLOT.glow)
    for (const [px, pz] of [[ox - 1, oz - 1], [ox + 2, oz - 1], [ox - 1, oz + 2], [ox + 2, oz + 2]]) v.box(px, -19, pz, px + 1, -14, pz + 1, gold, SLOT.metal)
    v.box(ox - 1, -20, oz - 1, ox + 3, -19, oz + 3, gold, SLOT.metal)
  }
  return v
}
````

### 2. `src/scene/Hanging.tsx`

The warm version drew the chandeliers with the shared slot materials and had no motes. The soul-fire
version adds the soul flame material, the gold material swap, the soul motes and the per-frame
breathing uniforms.

From `src/scene/Hanging.tsx` (whole file, 70 lines) at `bfb2525`:

````tsx
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
````

### 3. `src/gfx/lightField.ts`: the chandelier light

**Import** (the soul-fire version adds `soulFlicker`):

From `src/gfx/lightField.ts`, lines 31–31 at `bfb2525`:

````ts
import { lanternFlicker, pivotMatrix, torchFlicker } from '../world/motion'
````

**Tunables** (chandelier: warm colour, intensity 36, range 15):

From `src/gfx/lightField.ts`, lines 64–72 at `bfb2525`:

````ts
/* ───────────────────────────── tunables ───────────────────────────── */

export const LIGHT = {
  torch: { color: COLORS.torch, intensity: 9, range: 8.5 },
  chandelier: { color: COLORS.lantern, intensity: 36, range: 15 },
  hanging: { color: COLORS.lantern, intensity: 9, range: 9 },
  standing: { color: COLORS.lantern, intensity: 7, range: 8 },
  portal: { intensity: 34, range: 12 },
} as const
````

**Source placement** (the chandelier light sat 1.45 m below the origin; the soul-fire version uses 2.3):

From `src/gfx/lightField.ts`, lines 99–112 at `bfb2525`:

````ts
  for (const l of hall.lanterns) {
    const conf = l.kind === 'chandelier' ? LIGHT.chandelier : l.kind === 'hanging' ? LIGHT.hanging : LIGHT.standing
    let local: Vector3 | null = null
    const pos = new Vector3(...l.position)
    if (l.anchor) {
      // light sits at the lantern's centre / just under the chandelier hub, relative to the pivot
      const drop = l.anchor[1] - l.position[1]
      // chandelier: level with its arm lanterns; hanging lantern: its glowing core
      local = new Vector3(0, -drop - (l.kind === 'chandelier' ? 1.45 : 0.83), 0)
    } else pos.y += 0.95 * (l.scale ?? 1) // just above the cage: no hot spot on the polished floor
    const margin = local ? Math.abs(local.y) * 0.05 + 0.1 : 0
    const boost = l.boost ?? 1
    add({ kind: l.kind === 'chandelier' ? 'chandelier' : 'lantern', owner: l.id, pos, local, lantern: l, color: lin(conf.color), intensity: conf.intensity * boost, range: conf.range * Math.sqrt(boost), margin, seed: l.id * 3.17 })
  }
````

**Flicker** (chandeliers used `lanternFlicker`; the soul-fire version adds a `soulFlicker` branch):

From `src/gfx/lightField.ts`, lines 214–214 at `bfb2525`:

````ts
      s.flicker = s.kind === 'torch' ? torchFlicker(s.seed, t) : s.kind === 'portal' ? 0.94 + 0.06 * Math.sin(t * 1.7 + s.seed) : lanternFlicker(s.seed, t)
````

**`patch()` and the field shader** (no `fieldGain` option yet; the soul-fire version adds it and
turns `FIELD_GLSL` into a `fieldGlsl(gain)` function):

From `src/gfx/lightField.ts`, lines 234–317 at `bfb2525`:

````ts
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
        .replace('#include <lights_fragment_end>', `${FIELD_GLSL}\n#include <lights_fragment_end>`)
    }
    material.customProgramCacheKey = () => `lightfield:${opts.key ?? ''}`
    return material
  }
}

const FIELD_GLSL = /* glsl */ `
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
      lfL.color = lfCol.rgb * getDistanceAttenuation(d, lfPR.w, 2.0);
      lfL.visible = true;
      RE_Direct(lfL, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
    }
  }
}
`
````

### 4. `src/world/layout.ts`: chandelier placement (unchanged, for reference)

From `src/world/layout.ts`, lines 243–251 at `bfb2525`:

````ts
    // A chandelier over the centre aisle from every cross beam, a pair of hanging lanterns over the
    // side aisles on every other bay, and a standing lantern on the ledge every third bay.
    const beamBottom = HALL.beamY
    lanterns.push({ id: lanterns.length, kind: 'chandelier', position: [0, beamBottom - 5.4, pillarCenterZ], anchor: [0, beamBottom, pillarCenterZ] })
    if (bay % 2 === 1) {
      for (const s of [-1, 1]) {
        lanterns.push({ id: lanterns.length, kind: 'hanging', position: [s * 2.4, beamBottom - 2.6, pillarCenterZ], anchor: [s * 2.4, beamBottom, pillarCenterZ] })
      }
    }
````

### 5. `src/gfx/materials.ts`

The warm version had no `soulGoldMaterial()`; chandeliers used the shared `metal` slot from
`slotMaterials()`:

From `src/gfx/materials.ts`, lines 39–57 at `bfb2525`:

````ts
let slots: Material[] | null = null
/**
 * Materials indexed by voxel SLOT, for multi-group voxel geometry:
 * matte (wood, cloth, stone), metal (iron, gold, steel), glow (unlit HDR: flames, lantern glass),
 * gem (glossy coloured: diamond-finish armour, jewels).
 */
export function slotMaterials(): Material[] {
  if (slots) return slots
  const matte = withLightField(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }), { key: 'matte', env: 0.3 })
  const metal = withLightField(new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.8 }), { key: 'metal', env: 1.4 })
  const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new Color(1, 1, 1).multiplyScalar(2.1) })
  const gem = withLightField(new MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.35 }), { key: 'gem', env: 1.2 })
  slots = []
  slots[SLOT.matte] = matte
  slots[SLOT.metal] = metal
  slots[SLOT.glow] = glow
  slots[SLOT.gem] = gem
  return slots
}
````

### 6. `src/scene/Lighting.tsx`: shadow-pool selection

Every source was a candidate. The soul-fire version adds `if (s.kind === 'chandelier') continue`
at the top of this loop.

From `src/scene/Lighting.tsx`, lines 70–86 at `bfb2525`:

````tsx
  useFrame(({ camera, clock }, dt) => {
    // 1. choose (with hysteresis: a held source only loses its slot to a clearly better one)
    timer.current -= dt
    if (timer.current <= 0) {
      timer.current = RESELECT
      camera.getWorldDirection(camDir)
      const scored: { s: LightSource; score: number }[] = []
      for (const s of lightField.sources) {
        const e = lightField.strength(s)
        if (e < 0.05 * s.intensity) continue
        to.copy(s.pos).sub(camera.position)
        const d2 = to.lengthSq()
        if (d2 > 30 * 30) continue
        const facing = to.normalize().dot(camDir) > -0.2 ? 1 : 0.3
        const held = slots.some((p) => p.source === s) ? 1.4 : 1
        scored.push({ s, score: (e / Math.max(d2, 4)) * facing * held })
      }
````

### 7. `src/scene/Atmosphere.tsx`: dust

Warm everywhere. The soul-fire version adds `uSoulColor` and a `vSoul` height and aisle blend.

From `src/scene/Atmosphere.tsx` (whole file, 82 lines) at `bfb2525`:

````tsx
/**
 * Drifting dust: a box of motes that wraps around the camera (so the whole hall always has dust
 * without simulating 110 m of it). Motes are faint, warm, and pick up a little brightness near
 * the floor and in the upper air where light pools.
 */
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three'
import { FOG_DENSITY } from '../config/theme'
import { useApp } from '../state/store'

const BOX = new Vector3(14, 15, 36)

export function Atmosphere() {
  const high = useApp((s) => s.quality) === 'high'
  const count = high ? 900 : 380
  const { geo, mat } = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * BOX.x
      pos[i * 3 + 1] = Math.random() * BOX.y
      pos[i * 3 + 2] = Math.random() * BOX.z
      seed[i] = Math.random()
    }
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 1))
    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 800 },
        uOrigin: { value: new Vector3() },
        uBox: { value: BOX },
        uColor: { value: new Color('#ffd9a8') },
        uFog: { value: FOG_DENSITY },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uScale; uniform vec3 uOrigin; uniform vec3 uBox; uniform float uFog;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.11 + aSeed * 30.0) * 0.6, uTime * (0.03 + aSeed * 0.04), uTime * 0.05);
          // wrap into a box centred on the camera (floor-aligned in y)
          vec3 lo = vec3(uOrigin.x - uBox.x * 0.5, 0.0, uOrigin.z - uBox.z * 0.5);
          p = lo + mod(p - lo, uBox);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = (0.012 + 0.02 * fract(aSeed * 7.13)) * uScale / -mv.z;
          gl_PointSize = max(size, 1.0);
          float twinkle = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.5 + aSeed) + aSeed * 40.0));
          // fade at the box edges so wrapping never shows
          vec3 e = abs((p - lo) / uBox - 0.5) * 2.0;
          float edge = (1.0 - smoothstep(0.75, 1.0, e.x)) * (1.0 - smoothstep(0.7, 1.0, e.z));
          float f = uFog * -mv.z;
          vAlpha = twinkle * edge * min(size, 1.0) * exp(-f * f) * 0.5;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, d) * vAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    })
    return { geo: g, mat }
  }, [count])

  useFrame(({ gl, camera }, dt) => {
    mat.uniforms.uTime.value += dt
    mat.uniforms.uOrigin.value.copy(camera.position)
    mat.uniforms.uScale.value = gl.domElement.height / (2 * Math.tan((((camera as PerspectiveCamera).fov ?? 60) * Math.PI) / 360))
  })

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />
}
````

### 8. `src/config/theme.ts`

No `soul` colour yet:

From `src/config/theme.ts` (whole file, 15 lines) at `bfb2525`:

````ts
/** Single source of truth for scene + UI colours. */
export const COLORS = {
  /** Far-end fog / clear colour: blue-black. */
  fog: '#05060c',
  /** Cool fill so shadows read navy, never pure black. */
  ambient: '#4a5680',
  ambientGround: '#120f14',
  torch: '#ffa04a',
  lantern: '#ffc982',
  ui: '#e9e6f2',
  uiDim: '#9a96ad',
} as const

/** Fog density (FogExp2): ~65 % visibility at 40 m, ~5 % at the far wall (~110 m). */
export const FOG_DENSITY = 0.016
````

### 9. `src/world/motion.ts`

No `soulFlicker` yet. Chandeliers used this:

From `src/world/motion.ts`, lines 46–49 at `bfb2525`:

````ts
/** Lantern breathing (~0.95..1.0): slow and steady. */
export function lanternFlicker(seed: number, t: number) {
  return 0.975 + 0.018 * Math.sin(t * 2.3 + seed) + 0.008 * Math.sin(t * 7.9 + seed * 2.0)
}
````

## Restoring the warm design

1. **See the full difference first.** From the repo root:

   ```sh
   # everything the soul-fire change did, warm (old) → soul fire (new)
   git diff bfb2525 <soul-fire commit> -- src/
   # or, before the soul-fire change is committed: warm commit vs your working tree
   git diff bfb2525 -- src/
   # one file at a time
   git diff bfb2525 <soul-fire commit> -- src/scene/Hanging.tsx
   ```

   Replace `<soul-fire commit>` with the hash of the commit that adds soul fire (`git log --oneline`).

2. **Fastest: restore the eight files from the warm commit.** This is safe only if no *other*
   changes have been made to these files since. Check with the diff in step 1 first.

   ```sh
   git restore --source=bfb2525 -- \
     src/scene/models.ts src/scene/Hanging.tsx src/gfx/lightField.ts src/gfx/materials.ts \
     src/scene/Lighting.tsx src/scene/Atmosphere.tsx src/config/theme.ts src/world/motion.ts
   ```

3. **Otherwise: revert the soul-fire commit**, if it is a commit of its own:
   `git revert <soul-fire commit>`.

4. **Or by hand**, if later work has touched these files. Use the code above:
   1. `models.ts`: replace the soul-cage loop at the end of `chandelier()` with the warm arm-lantern
      loop, and delete `SOUL_CAGE`, `SOUL`, `SOUL_PANE` and `soulCage()`.
   2. `Hanging.tsx`: draw the chandelier `instancedMesh` with `materials` instead of `soulMaterials`,
      and remove `soulMaterial()`, the motes, `soulLevel` and `soulTime`, and their `useFrame` lines.
      Remove `SOUL_CAGE` from the imports.
   3. `lightField.ts`: set the chandelier back to `color: COLORS.lantern, intensity: 36, range: 15`
      and the offset back to `1.45`. Remove the `soulFlicker` branch and import. `fieldGain` and
      `fieldGlsl()` can stay: with no gain given they behave exactly like the old `FIELD_GLSL`.
   4. `materials.ts`: delete `soulGoldMaterial()` (nothing else uses it).
   5. `Lighting.tsx`: delete the `if (s.kind === 'chandelier') continue` line and its comment.
   6. `Atmosphere.tsx`: drop `uSoulColor` and `vSoul`, and output `uColor * a` again.
   7. `theme.ts` and `motion.ts`: `COLORS.soul` and `soulFlicker` can be deleted once nothing
      imports them.

5. **Check it:** `npx tsc -b`, then `npm run dev` and open `/?z=-10&pitch=45`. The chandelier
   lanterns should glow warm amber, and the light under them should be warm.
