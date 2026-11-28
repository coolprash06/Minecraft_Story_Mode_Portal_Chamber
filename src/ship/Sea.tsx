/**
 * The open sea: one draw. A radial grid (dense under the camera, out to the haze at 2.4 km) that
 * follows the camera, with a gentle swell in the vertex shader. The fragment shader:
 *  • quantises the surface to 8 px per metre up close (half a block's pixels), released smoothly
 *    with distance so it never aliases; four directional waves give the normal;
 *  • deep blue → turquoise body, lighter on the crests, turquoise shallows and pale water at the
 *    shore from the island's coast distance map;
 *  • sky reflection with Fresnel, square sun glints (HDR, so they bloom), crest foam pixels;
 *  • surf: a broken foam band along the deck's hull and the island's coast, lapping in and out;
 *  • haze to the horizon colour (the sky's), so the sea's edge disappears into it.
 * Drawn after the ship and the island (renderOrder), so early-z skips whatever they cover.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DoubleSide, ShaderMaterial, Vector3, Vector4, type DataTexture, type Mesh } from 'three'
import { DECK, FOG_DENSITY, ISLAND, SEA, SEA_Y, SKY, SUN_DIR } from './constants'

const RINGS = 72
const SEGMENTS = 112
const RADIUS = 2400

/** Rings from the centre out, spaced as r = R·(i/RINGS)^2.4 (≈ 1 m apart near the camera). */
function seaGeometry() {
  const pos = new Float32Array((RINGS * SEGMENTS + 1) * 3)
  let o = 3 // vertex 0 is the centre
  for (let i = 1; i <= RINGS; i++) {
    const r = RADIUS * Math.pow(i / RINGS, 2.4)
    for (let s = 0; s < SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2
      pos[o++] = Math.cos(a) * r
      pos[o++] = 0
      pos[o++] = Math.sin(a) * r
    }
  }
  const index: number[] = []
  for (let s = 0; s < SEGMENTS; s++) index.push(0, 1 + ((s + 1) % SEGMENTS), 1 + s)
  for (let i = 1; i < RINGS; i++) {
    const a0 = 1 + (i - 1) * SEGMENTS
    const b0 = 1 + i * SEGMENTS
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS
      index.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setIndex(index)
  return g
}

export const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
`

/** Four directional waves (direction·k, amplitude, speed): the big two also move the vertices. */
const WAVES = /* glsl */ `
  const vec4 WA = vec4(normalize(vec2(1.0, 0.35)) * 0.70, 0.11, 0.95);
  const vec4 WB = vec4(normalize(vec2(0.6, -0.8)) * 1.19, 0.06, 1.30);
  const vec4 WC = vec4(normalize(vec2(-0.3, 1.0)) * 2.03, 0.032, 1.75);
  const vec4 WD = vec4(normalize(vec2(0.9, 0.6)) * 3.70, 0.016, 2.40);
  float swell(vec2 p, float t) {
    return WA.z * sin(dot(WA.xy, p) - t * WA.w) + WB.z * sin(dot(WB.xy, p) - t * WB.w);
  }
  // height (x) and gradient (yz) of all four
  vec3 waves(vec2 p, float t) {
    vec3 r = vec3(0.0);
    float s; float c;
    s = dot(WA.xy, p) - t * WA.w; r += WA.z * vec3(sin(s), WA.xy * cos(s));
    s = dot(WB.xy, p) - t * WB.w; r += WB.z * vec3(sin(s), WB.xy * cos(s));
    s = dot(WC.xy, p) - t * WC.w; r += WC.z * vec3(sin(s), WC.xy * cos(s));
    s = dot(WD.xy, p) - t * WD.w; r += WD.z * vec3(sin(s), WD.xy * cos(s));
    return r;
  }
`

function seaMaterial(coast: DataTexture) {
  const v3 = (c: { r: number; g: number; b: number }) => new Vector3(c.r, c.g, c.b)
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSeaY: { value: SEA_Y },
      uSunDir: { value: SUN_DIR.clone() },
      uSun: { value: v3(SKY.sun) },
      uDeep: { value: v3(SEA.deep) },
      uMid: { value: v3(SEA.mid) },
      uShallow: { value: v3(SEA.shallow) },
      uShore: { value: v3(SEA.shore) },
      uFoam: { value: v3(SEA.foam) },
      uHorizon: { value: v3(SKY.horizon) },
      uZenith: { value: v3(SKY.upper) },
      // the deck's footprint (centre xz, half size xz) for the hull surf
      uHull: { value: new Vector4(0, (DECK.z0 + DECK.z1) / 2, DECK.halfW, (DECK.z1 - DECK.z0) / 2) },
      uIsland: { value: new Vector3(ISLAND.x, ISLAND.z, ISLAND.half) },
      uCoast: { value: coast },
      uFog: { value: FOG_DENSITY },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uSeaY;
      varying vec3 vWorld;
      ${WAVES}
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        // the swell fades out with distance (the far sea is flat and hazy anyway)
        float fade = 1.0 - smoothstep(80.0, 300.0, length(w.xz - cameraPosition.xz));
        w.y = uSeaY + swell(w.xz, uTime) * fade;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir; uniform vec3 uSun;
      uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; uniform vec3 uShore; uniform vec3 uFoam;
      uniform vec3 uHorizon; uniform vec3 uZenith;
      uniform vec4 uHull; uniform vec3 uIsland; uniform sampler2D uCoast; uniform float uFog;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      ${WAVES}
      float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        vec2 p = vWorld.xz;
        vec3 toCam = cameraPosition - vWorld;
        float dc = length(toCam);
        vec3 V = toCam / dc;

        // pixel grid up close (8 px per metre), released once a pixel is smaller than a screen pixel
        vec2 fw = fwidth(p);
        float crisp = 1.0 - smoothstep(0.07, 0.22, max(fw.x, fw.y));
        vec2 cell = floor(p * 8.0);
        vec2 q = mix(p, (cell + 0.5) / 8.0, crisp);

        vec3 w = waves(q, uTime);
        float far = smoothstep(30.0, 420.0, dc);
        vec2 g = w.yz * mix(1.0, 0.2, far);
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

        // distance to the island's coast (m); far away = open sea
        vec2 cuv = (p - uIsland.xy + uIsland.z + 0.5) / (2.0 * uIsland.z);
        float coast = 64.0;
        if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0) coast = texture2D(uCoast, cuv).r * 63.75;

        // body: deep blue → turquoise on the crests; the shallows lighten towards the beach
        float crestK = clamp(0.5 + w.x * 3.0, 0.0, 1.0);
        vec3 body = mix(uDeep, uMid, 0.35 + 0.45 * crestK);
        body = mix(body, uShallow, 1.0 - smoothstep(2.0, 30.0, coast));
        body = mix(body, uShore, (1.0 - smoothstep(0.5, 7.0, coast)) * 0.85);
        body *= 0.78 + 0.3 * max(dot(N, uSunDir), 0.0);

        // sky reflection
        float facing = clamp(dot(N, V), 0.0, 1.0);
        float fres = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.55));
        vec3 col = mix(body, sky, fres * 0.85);

        // sun glints: square pixels up close (thresholded), a soft streak far away
        float spec = pow(max(dot(R, uSunDir), 0.0), 420.0);
        float glint = mix(spec * 3.0, step(0.25, spec) * 4.0, crisp);
        col += uSun * glint;

        // foam: crest pixels, the hull's surf, the beach's surf (lapping in and out)
        float crest = smoothstep(0.12, 0.16, w.x) * step(0.55, hash12(cell + floor(uTime * 1.5) * 13.0)) * crisp;
        float n = vnoise(q * 1.6 + vec2(uTime * 0.35, -uTime * 0.22));
        float dh = sdRoundBox(p - uHull.xy, uHull.zw, 0.9);
        float hull = step(-0.1, dh) * step(0.5, (1.0 - smoothstep(0.0, 1.9, dh)) * (0.55 + 0.75 * n));
        float lap = 1.0 - smoothstep(0.0, 0.9, abs(coast - (2.6 + 1.4 * sin(uTime * 0.7))));
        float beach = step(0.55, ((1.0 - smoothstep(0.2, 2.2, coast)) + lap * 0.7) * (0.45 + 0.8 * n));
        col = mix(col, uFoam, max(max(hull, beach) * 0.92, crest * 0.55));

        // haze to the horizon
        float f = uFog * dc;
        col = mix(col, uHorizon, 1.0 - exp(-f * f));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

export function Sea({ coast }: { coast: DataTexture }) {
  const geo = useMemo(seaGeometry, [])
  const mat = useMemo(() => seaMaterial(coast), [coast])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  const ref = useRef<Mesh>(null)
  // after ShipRig (mounted first) has placed this frame's camera: follow it in 4 m steps (the
  // waves live in world space, so nothing swims)
  useFrame(({ camera }, dt) => {
    mat.uniforms.uTime.value += dt
    ref.current?.position.set(Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4)
  })
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={1} />
}
