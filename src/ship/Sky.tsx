/**
 * The bright tropical sky: one full-screen triangle at the far plane, drawn after everything else
 * (renderOrder), so only the uncovered pixels shade it.
 *  • Gradient from the pale horizon to a deep azure zenith, posterised into narrow bands with an
 *    ordered dither in 3-px blocks (the pixel-art banding of the placeholder art, but blue).
 *  • A square sun with a soft halo (HDR: it blooms).
 *  • A flat layer of voxel clouds 170 m up: 14 m cells, drifting slowly, with a shaded edge on
 *    the side away from the sun, fading out towards the horizon so distant cells never shimmer.
 */
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, LessEqualDepth, ShaderMaterial, Vector3 } from 'three'
import { OFF } from '../lib/debug'
import { SEA_Y, SKY, SUN_DIR } from './constants'
import { NOISE_GLSL } from './Sea'

function skyMaterial() {
  const v3 = (c: { r: number; g: number; b: number }) => new Vector3(c.r, c.g, c.b)
  const sunFlat = new Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize()
  return new ShaderMaterial({
    depthWrite: false,
    depthFunc: LessEqualDepth,
    defines: OFF.has('clouds') ? {} : { CLOUDS: '' },
    uniforms: {
      uTime: { value: 0 },
      uZenith: { value: v3(SKY.zenith) },
      uUpper: { value: v3(SKY.upper) },
      uHorizon: { value: v3(SKY.horizon) },
      uSun: { value: v3(SKY.sun) },
      uSunDir: { value: SUN_DIR.clone() },
      uSunFlat: { value: new Vector3(sunFlat.x, sunFlat.z, 0) },
      uCloud: { value: v3(SKY.cloud) },
      uCloudShade: { value: v3(SKY.cloudShade) },
      uCloudY: { value: SEA_Y + SKY.cloudHeight },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 clip = vec4(position.xy, 1.0, 1.0);
        vec4 v = inverse(projectionMatrix) * clip;
        vDir = (inverse(viewMatrix) * vec4(v.xyz / v.w, 0.0)).xyz;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uZenith; uniform vec3 uUpper; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir;
      uniform vec3 uSunFlat; uniform vec3 uCloud; uniform vec3 uCloudShade; uniform float uCloudY;
      varying vec3 vDir;
      ${NOISE_GLSL}
      // 4×4 ordered dither, 0..1
      float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
      float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      vec3 gradient(float y) {
        vec3 c = mix(uHorizon, uUpper, smoothstep(0.0, 0.3, y));
        return mix(c, uZenith, smoothstep(0.25, 0.95, y));
      }
      float cloudAt(vec2 cell) {
        return step(0.62, vnoise(cell * 0.13) * 0.65 + vnoise(cell * 0.37 + 7.0) * 0.35);
      }
      void main() {
        vec3 d = normalize(vDir);
        // dithered bands: 36 bands from the horizon up, in 3-px blocks
        float bands = 36.0;
        float yb = floor(max(d.y, 0.0) * bands + bayer4(gl_FragCoord.xy / 3.0)) / bands;
        vec3 col = gradient(yb);
        // under the horizon (only past the sea's edge): the haze
        col = mix(col, uHorizon, smoothstep(0.0, -0.05, d.y));

        // the sun: a square disc facing you, and a halo
        float sd = dot(d, uSunDir);
        if (sd > 0.0) {
          vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), uSunDir));
          vec3 B = cross(uSunDir, T);
          vec2 sp = vec2(dot(d, T), dot(d, B)) / sd;
          float disc = 1.0 - step(0.05, max(abs(sp.x), abs(sp.y)));
          float r = length(sp);
          col += uSun * (disc * 6.0 + exp(-r * 10.0) * 0.55 + exp(-r * 2.6) * 0.12);
        }

        #ifdef CLOUDS
        if (d.y > 0.012) {
          float t = (uCloudY - cameraPosition.y) / d.y;
          vec2 cp = cameraPosition.xz + d.xz * t + vec2(uTime * 1.6, uTime * 0.5);
          vec2 cell = floor(cp / 14.0);
          float c = cloudAt(cell);
          if (c > 0.5) {
            // the cell's edge facing away from the sun is shaded
            vec2 away = -sign(uSunFlat.xy) * step(0.35, abs(uSunFlat.xy));
            float lit = cloudAt(cell + vec2(away.x, 0.0)) * cloudAt(cell + vec2(0.0, away.y));
            vec2 f = fract(cp / 14.0);
            float rim = (1.0 - lit) * 0.5;
            vec3 cc = mix(uCloud, uCloudShade, rim + 0.15 * step(0.85, max(f.x, f.y)));
            float fade = (1.0 - smoothstep(900.0, 2600.0, t)) * smoothstep(0.03, 0.12, d.y);
            col = mix(col, cc * 1.08, fade);
          }
        }
        #endif
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

/** A triangle covering the whole screen in clip space. */
function fullScreen() {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  return g
}

export function Sky() {
  const geo = useMemo(fullScreen, [])
  const mat = useMemo(skyMaterial, [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt
  })
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />
}
