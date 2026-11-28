/**
 * The portal surface shader (shared by the hall's 18 portals and Mission 1's deck portal): an
 * animated swirl of layered noise in the portal's colour, quantised to the block grid (16 px per
 * block) and to a few tones; `fill` reveals it from the bottom up behind a bright ragged front;
 * entry "spiral mode" grows rings and arms from the centre. See scene/Portals for the hall's use.
 */
import { FrontSide, ShaderMaterial, type Side } from 'three'

export const PORTAL_NOISE = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`

/**
 * The portal surface material (instanced: one instance per portal; the per-instance attributes are
 * aColor, aLevel, aSeed, aFill and aSpiral = (spiral, spiral clock, fade)). `time` is the caller's
 * clock uniform; `fog` its FogExp2 density (the surface fades to black with it, like the hall).
 * `side`: DoubleSide for a free-standing portal you can walk round (Mission 1's deck portal).
 */
export function surfaceMaterial({ time, fog, side = FrontSide }: { time: { value: number }; fog: number; side?: Side }) {
  return new ShaderMaterial({
    side,
    uniforms: { uTime: time, uFog: { value: fog } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aLevel; attribute float aSeed; attribute float aFill; attribute vec3 aSpiral;
      uniform float uFog;
      varying vec2 vUv; varying vec3 vColor; varying float vLevel; varying float vSeed; varying float vFog; varying float vFill; varying vec3 vSpiral;
      void main() {
        vUv = uv; vColor = aColor; vLevel = aLevel; vSeed = aSeed; vFill = aFill; vSpiral = aSpiral;
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        float f = uFog * -mv.z; vFog = exp(-f * f);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${PORTAL_NOISE}
      uniform float uTime;
      varying vec2 vUv; varying vec3 vColor; varying float vLevel; varying float vSeed; varying float vFog; varying float vFill; varying vec3 vSpiral;
      void main() {
        if (vFill < 0.002 || vSpiral.z < 0.004) discard;
        if (vFill < 0.002) discard;
        // 3 × 4 blocks → 48 × 64 pixels
        vec2 grid = vec2(48.0, 64.0);
        vec2 cell = floor(vUv * grid);
        vec2 uv = (cell + 0.5) / grid;
        vec2 p = (uv - 0.5) * vec2(3.0, 4.0);

        // reveal: fills from the bottom up behind a ragged, flickering front (in opening heights)
        float ragged = (vnoise(vec2(cell.x * 0.35, uTime * 3.0 + vSeed * 9.0)) - 0.5) * 0.09
                     + (hash12(cell + floor(uTime * 12.0)) - 0.5) * 0.03;
        float reveal = vFill * 1.12 - uv.y + ragged;
        if (reveal < 0.0) discard;
        float lvl = vLevel * vLevel * (3.0 - 2.0 * vLevel);

        // vSpiral.y: extra clock that runs while spiral mode is on (the swirl speeds up smoothly)
        float t = uTime * 0.55 + vSeed * 20.0 + vSpiral.y * 0.55;
        // domain-warped logarithmic spiral: continuous arms that turn and drift, broken up by noise
        vec2 w = p + (vec2(fbm(p * 0.8 + vec2(t * 0.15, 0.0)), fbm(p * 0.8 + vec2(5.2, -t * 0.12))) - 0.5) * 1.1;
        float r = length(w) + 0.001;
        float a = atan(w.y, w.x);
        float arms = sin(2.0 * a + 4.2 * log(r + 0.25) - t * 2.4);
        float swirl = 0.5 + 0.5 * arms;
        float grain = fbm(w * 1.6 - vec2(0.0, t * 0.5));
        float v = clamp(mix(swirl, grain, 0.38) + (1.0 - smoothstep(0.0, 1.4, r)) * 0.15, 0.0, 1.0);
        v = floor(v * 5.0 + 0.5) / 5.0;           // posterise
        float sparkle = step(0.994, hash12(cell + floor(uTime * 6.0) * 7.0 + vSeed));

        // deep tones lean towards violet, highlights stay saturated (no white-out)
        vec3 deep = mix(vColor, vec3(0.35, 0.1, 0.6), 0.35) * 0.18;
        vec3 mid = vColor * 0.75;
        vec3 hot = mix(vColor, vec3(1.0), 0.3) * 1.25;
        vec3 col = mix(deep, mid, smoothstep(0.1, 0.6, v));
        col = mix(col, hot, smoothstep(0.65, 1.0, v));
        col += mix(vColor, vec3(1.0), 0.5) * sparkle;

        // entry spiral: rotating rings + spiral arms reaching out from the centre, a pulsing core
        if (vSpiral.x > 0.001) {
          float sr = length(p);
          float ang = atan(p.y, p.x);
          float st = uTime + vSpiral.y;
          float rings = 0.5 + 0.5 * sin(sr * 9.0 - st * 7.0);
          float arms = 0.5 + 0.5 * sin(ang * 3.0 + log(sr + 0.05) * 6.0 - st * 5.5);
          float pat = smoothstep(0.55, 0.95, max(rings * 0.9, arms));
          pat = floor(pat * 3.0 + 0.5) / 3.0;
          float reach = 1.0 - smoothstep(vSpiral.x * 3.0 - 0.45, vSpiral.x * 3.0, sr);
          float core = exp(-sr * sr * 2.2) * (0.6 + 0.4 * sin(st * 8.0));
          col = mix(col, deep * 0.7 + col * 0.3, reach * 0.65);
          col += mix(vColor, vec3(1.0), 0.35) * 1.5 * pat * reach + mix(vColor, vec3(1.0), 0.6) * core * vSpiral.x * 1.3;
        }
        // bright front where the surface is still climbing (gone once full)
        float forming = 1.0 - smoothstep(0.9, 1.0, vFill);
        col += mix(vColor, vec3(1.0), 0.45) * 2.6 * (1.0 - smoothstep(0.0, 0.07, reveal)) * forming;
        col += vColor * 0.6 * (1.0 - smoothstep(0.0, 0.3, reveal)) * forming;
        float intensity = 1.35 * (0.88 + 0.12 * sin(uTime * 1.7 + vSeed * 9.0)) * mix(0.55, 1.0, lvl);
        // vSpiral.z: fade (reduced-motion extinguish); 1 normally
        gl_FragColor = vec4(col * intensity * vFog * vSpiral.z, 1.0);
      }`,
    toneMapped: false,
  })
}
