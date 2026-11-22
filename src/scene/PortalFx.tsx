/**
 * Effects on the interactive portals:
 *  • hover: a glowing outline round the frame, and the frame's own glow lifts (portalFx.hover);
 *  • ignite (right flint): a spark burst along the bottom of the opening, the swirl fills the
 *    opening bottom-up over ~1.5 s (portalFx.fill), a frame flash, a short camera shake and FOV
 *    pulse; the floor light pool fades in through the light field on its own (litMask);
 *  • fizzle (wrong flint): a few dull sparks dying in a puff of grey smoke.
 * The particle systems are always in the scene (idle = every point culled in the vertex shader), so
 * their programs compile behind the loading veil and the first click never hitches.
 */
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import gsap from 'gsap'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three'
import { FLINTS } from '../config/items'
import { PORTAL_COLORS } from '../config/portals'
import { FOG_DENSITY } from '../config/theme'
import { outlineGeometry, outlineMaterial, pointScaleFor, wallMatrix } from '../gfx/outline'
import { cameraFx, portalFx } from '../gfx/portalFx'
import { damp } from '../lib/random'
import { onGame } from '../state/events'
import { appStore, isLit } from '../state/store'
import { hall } from '../world/layout'

const ENABLED = FLINTS.map((f) => f.portalId)
const pointScale = { value: 800 }

/* ───────────────────────────── bursts (sparks + smoke) ───────────────────────────── */

/** Uniforms shared by one burst: where (bottom of the opening), when, and in what colour. */
function burstUniforms() {
  return {
    uOrigin: { value: new Vector3(0, -100, 0) },
    uAlong: { value: new Vector3(0, 0, 1) },
    uNormal: { value: new Vector3(1, 0, 0) },
    uAge: { value: -1 },
    uColor: { value: new Color() },
    /** 1 = ignition sparks, 0 = dull fizzle sparks. */
    uHot: { value: 1 },
    uScale: pointScale,
    uFog: { value: FOG_DENSITY },
  }
}

function seeds(n: number) {
  const g = new BufferGeometry()
  const s = new Float32Array(n * 4)
  for (let i = 0; i < s.length; i++) s[i] = Math.random()
  // positions are computed in the shader; a dummy attribute sets the vertex count
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
  g.setAttribute('aSeed', new BufferAttribute(s, 4))
  return g
}

const SPARKS = 120
function sparkMaterial() {
  return new ShaderMaterial({
    uniforms: burstUniforms(),
    vertexShader: /* glsl */ `
      uniform vec3 uOrigin; uniform vec3 uAlong; uniform vec3 uNormal; uniform float uAge; uniform float uHot;
      uniform float uScale; uniform float uFog;
      attribute vec4 aSeed;
      varying float vHeat; varying float vA;
      void main() {
        float age = uAge - aSeed.z * 0.18;               // staggered launches
        float life = mix(0.35, 1.0, aSeed.w) * mix(0.55, 1.0, uHot);
        bool alive = age > 0.0 && age < life && (uHot > 0.5 || aSeed.y < 0.3);
        if (!alive) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vHeat = 0.0; return; }
        float speed = mix(0.45, 1.0, uHot);
        vec3 v = uNormal * (0.5 + aSeed.y * 2.4) + vec3(0.0, 1.4 + aSeed.w * 3.2, 0.0) + uAlong * (aSeed.x - 0.5) * 2.2;
        vec3 p = uOrigin + uAlong * (aSeed.x - 0.5) * 3.0 + v * speed * age + vec3(0.0, -4.9, 0.0) * age * age;
        p.y = max(p.y, 0.03);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float k = age / life;
        vHeat = 1.0 - k;
        gl_PointSize = max(1.0, (0.035 + 0.03 * aSeed.x) * (1.0 - 0.6 * k) * uScale / -mv.z);
        float f = uFog * -mv.z;
        vA = (1.0 - k * k) * exp(-f * f);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uHot;
      varying float vHeat; varying float vA;
      void main() {
        if (vA < 0.01) discard;
        // white-hot → gold → the portal colour as they cool; fizzle sparks are dull orange → ash
        vec3 hot = mix(mix(uColor, vec3(1.0, 0.75, 0.35), 0.6), vec3(1.0, 0.95, 0.8), vHeat * vHeat);
        vec3 dull = mix(vec3(0.25, 0.24, 0.23), vec3(1.0, 0.55, 0.2), vHeat);
        vec3 c = mix(dull, hot, uHot) * mix(1.4, 3.2, uHot);
        gl_FragColor = vec4(c * vA, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

const PUFFS = 34
function smokeMaterial() {
  return new ShaderMaterial({
    uniforms: burstUniforms(),
    vertexShader: /* glsl */ `
      uniform vec3 uOrigin; uniform vec3 uAlong; uniform vec3 uNormal; uniform float uAge;
      uniform float uScale; uniform float uFog;
      attribute vec4 aSeed;
      varying float vA; varying float vShade; varying vec2 vSeed;
      void main() {
        float age = uAge - aSeed.z * 0.35;
        float life = mix(1.4, 2.6, aSeed.w);
        if (age <= 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
        float k = age / life;
        vec3 p = uOrigin + uAlong * (aSeed.x - 0.5) * 2.4 + uNormal * (0.15 + aSeed.y * 0.5 + k * 0.4);
        p.y += 0.1 + (0.5 + aSeed.y * 0.7) * age * (1.0 - 0.3 * k);
        p += uAlong * sin(age * 1.7 + aSeed.x * 20.0) * 0.12;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, (0.22 + 0.35 * k + 0.12 * aSeed.y) * uScale / -mv.z);
        float f = uFog * -mv.z;
        vA = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.45, 1.0, k)) * 0.55 * exp(-f * f);
        vShade = 0.75 + 0.5 * aSeed.y;
        vSeed = aSeed.xy;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vShade; varying vec2 vSeed;
      void main() {
        // chunky 6 × 6 pixel puff with a soft edge
        vec2 q = (floor(gl_PointCoord * 6.0) + 0.5) / 6.0 - 0.5;
        float d = max(abs(q.x), abs(q.y)) * 2.0;
        float a = vA * (1.0 - smoothstep(0.55, 1.0, d));
        if (a < 0.01) discard;
        vec3 c = vec3(0.16, 0.16, 0.17) * vShade;
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
  })
}

/** Bottom-centre of a portal's opening (just in front of it), its along-wall axis and normal. */
function burstFrame(portalId: number) {
  const p = hall.portals[portalId]
  const n = new Vector3(...p.normal)
  const along = new Vector3(0, 1, 0).cross(n)
  const origin = new Vector3(...p.center).addScaledVector(n, 0.55).setY(p.center[1] - p.height / 2 + 0.06)
  return { origin, along, n }
}

/* ───────────────────────────── component ───────────────────────────── */

export function PortalFx() {
  const { sparkGeo, sparkMat, smokeGeo, smokeMat, rings } = useMemo(() => {
    const rings = ENABLED.map((id) => {
      const p = hall.portals[id]
      const face = { position: [p.center[0] + p.normal[0] * 0.5, 3, p.center[2]] as [number, number, number], normal: p.normal }
      const col = '#' + new Color(PORTAL_COLORS[p.color]).lerp(new Color('#ffffff'), 0.35).getHexString()
      return { id, matrix: wallMatrix(face, 0.015), geo: outlineGeometry(5.12, 6.12, 0.07), mat: outlineMaterial(col, 1.8), hover: 0 }
    })
    return { sparkGeo: seeds(SPARKS), sparkMat: sparkMaterial(), smokeGeo: seeds(PUFFS), smokeMat: smokeMaterial(), rings }
  }, [])
  useEffect(
    () => () => {
      for (const d of [sparkGeo, sparkMat, smokeGeo, smokeMat, ...rings.flatMap((r) => [r.geo, r.mat])]) d.dispose()
    },
    [sparkGeo, sparkMat, smokeGeo, smokeMat, rings],
  )

  useEffect(() => {
    const aim = (m: ShaderMaterial, portalId: number, color: string) => {
      const f = burstFrame(portalId)
      m.uniforms.uOrigin.value.copy(f.origin)
      m.uniforms.uAlong.value.copy(f.along)
      m.uniforms.uNormal.value.copy(f.n)
      m.uniforms.uColor.value.set(color)
      m.uniforms.uAge.value = 0
    }
    const offIgnite = onGame('ignite', ({ portalId }) => {
      aim(sparkMat, portalId, PORTAL_COLORS[hall.portals[portalId].color])
      sparkMat.uniforms.uHot.value = 1
      // the swirl climbs the opening, the frame flares, the camera takes a soft hit
      const fill = { v: portalFx.fill[portalId] }
      const flash = { v: 0 }
      gsap
        .timeline()
        .to(fill, { v: 1, duration: 1.5, ease: 'sine.inOut', onUpdate: () => void (portalFx.fill[portalId] = fill.v) }, 0.08)
        .to(flash, { v: 1, duration: 0.18, ease: 'power2.out', onUpdate: () => void (portalFx.flash[portalId] = flash.v) }, 0.05)
        .to(flash, { v: 0, duration: 1.6, ease: 'power2.inOut', onUpdate: () => void (portalFx.flash[portalId] = flash.v) }, 0.3)
        .to(cameraFx, { shake: 1, duration: 0.07, ease: 'power1.out' }, 0.06)
        .to(cameraFx, { shake: 0, duration: 0.9, ease: 'power2.out' }, 0.13)
        .to(cameraFx, { fov: 1.6, duration: 0.22, ease: 'power2.out' }, 0.1)
        .to(cameraFx, { fov: 0, duration: 1.2, ease: 'sine.inOut' }, 0.32)
    })
    const offFizzle = onGame('fizzle', ({ portalId }) => {
      aim(sparkMat, portalId, '#ff8a3a')
      sparkMat.uniforms.uHot.value = 0
      aim(smokeMat, portalId, '#808080')
      smokeMat.uniforms.uAge.value = -0.12 // smoke follows the dying sparks
      gsap.timeline().to(cameraFx, { shake: 0.22, duration: 0.05 }).to(cameraFx, { shake: 0, duration: 0.35, ease: 'power2.out' })
    })
    return () => {
      offIgnite()
      offFizzle()
    }
  }, [sparkMat, smokeMat])

  useFrame(({ gl, camera }, dt) => {
    pointScale.value = pointScaleFor(gl.domElement.height, camera as PerspectiveCamera)
    for (const m of [sparkMat, smokeMat]) {
      const a = m.uniforms.uAge
      if (a.value !== -1) a.value = a.value > 4 ? -1 : a.value + dt
    }
    // hover outline + frame glow lift (a lit portal only lifts a little: "Coming soon")
    const st = appStore.get()
    const t = performance.now() / 1000
    for (const r of rings) {
      const hovered = st.hover?.kind === 'portal' && st.hover.portalId === r.id
      const lit = isLit(st.litMask, r.id)
      r.hover = damp(r.hover, hovered ? (lit ? 0.35 : 1) : 0, 10, dt)
      r.mat.opacity = r.hover * (0.7 + 0.3 * Math.sin(t * 6))
      portalFx.hover[r.id] = r.hover
    }
    const b = portalFx.boost.value
    for (let i = 0; i < b.length; i++) b[i] = portalFx.hover[i] * 0.45 + portalFx.flash[i] * 1.8
  })

  return (
    <group name="portal-fx">
      {rings.map((r) => (
        <mesh key={r.id} geometry={r.geo} material={r.mat} matrixAutoUpdate={false} matrix={r.matrix} renderOrder={6} />
      ))}
      <points geometry={sparkGeo} material={sparkMat} frustumCulled={false} renderOrder={7} />
      <points geometry={smokeGeo} material={smokeMat} frustumCulled={false} renderOrder={8} />
    </group>
  )
}
