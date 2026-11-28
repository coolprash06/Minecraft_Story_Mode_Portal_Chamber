/**
 * The blue deck portal: where you arrive (and, during development, how you leave). The same
 * portal as the hall's: frame blocks from the hall's atlas and mesher (with the lit frame glow),
 * the hall's surface shader (double-sided: the frame stands free on the deck), drifting motes on
 * both sides and a soft blue pool on the planks. `shipFx.spiral` / `flare` drive the entry and
 * arrival effects.
 */
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { PORTAL_COLORS } from '../config/portals'
import { blockAtlas } from '../gfx/atlas'
import { surfaceMaterial } from '../gfx/portalSurface'
import { frameBlock } from '../world/blocks'
import { VoxelGrid } from '../world/grid'
import { meshGrid } from '../world/mesher'
import { DECK, FOG_DENSITY, PORTAL } from './constants'
import { shipFx } from './shipFx'

const BLUE = PORTAL_COLORS.blue

/** Frame cells (hall blocks), meshed with the hall's mesher; faces lining the opening glow brighter. */
export function buildPortalFrame(): BufferGeometry[] {
  const g = new VoxelGrid([-PORTAL.halfW, PORTAL.y0, PORTAL.z], [PORTAL.halfW, PORTAL.y1, PORTAL.z], 0)
  const fc = frameBlock('blue')
  g.fill(-PORTAL.halfW, PORTAL.y0, PORTAL.z, PORTAL.halfW, PORTAL.y1, PORTAL.z, (x, y) => (y === PORTAL.y0 || y === PORTAL.y1 || Math.abs(x) === PORTAL.halfW ? fc : 0))
  // aEmit: portal id + 1 (one portal here), +0.5 on the faces lining the opening (x and y faces)
  return meshGrid(g, 16, (_x, _y, _z, axis) => 1 + (axis !== 2 ? 0.5 : 0)).map((c) => c.geometry)
}

/** The hall's block material with the lit portal-frame glow (always lit here), without the hall's light field. */
function frameMaterial(boost: { value: number }) {
  const atlas = blockAtlas()
  const m = new MeshStandardMaterial({ map: atlas.map, roughnessMap: atlas.mr, metalnessMap: atlas.mr, roughness: 1, metalness: 1, vertexColors: true })
  const glow = new Color(BLUE)
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = { value: glow }
    sh.uniforms.uBoost = boost
    sh.vertexShader = 'attribute float aEmit;\nvarying float vEmit;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vEmit = aEmit;')
    sh.fragmentShader =
      'varying float vEmit;\nuniform vec3 uGlow;\nuniform float uBoost;\n' +
      sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        if (vEmit > 0.5) {
          float rim = fract(vEmit) > 0.25 ? 1.0 : 0.0;
          float mask = texture2D(roughnessMap, vRoughnessMapUv).r;
          // as the hall's lit frames (level 1), plus the arrival / exit flare
          totalEmissiveRadiance += uGlow * mask * (1.2 + 1.8 * rim + uBoost * (0.8 + 0.8 * rim));
        }`,
      )
  }
  m.customProgramCacheKey = () => 'ship-portal-frame'
  return m
}

const MOTES = 56

function motes() {
  const g = new BufferGeometry()
  const pos = new Float32Array(MOTES * 3)
  const seed = new Float32Array(MOTES)
  const side = new Float32Array(MOTES)
  for (let i = 0; i < MOTES; i++) {
    pos[i * 3] = (Math.random() - 0.5) * PORTAL.width * 0.95
    pos[i * 3 + 1] = PORTAL.center[1] + (Math.random() - 0.5) * PORTAL.height * 0.95
    pos[i * 3 + 2] = PORTAL.z
    seed[i] = Math.random()
    side[i] = i % 2 ? 1 : -1
  }
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new BufferAttribute(seed, 1))
  g.setAttribute('aSide', new BufferAttribute(side, 1))
  return g
}

function moteMaterial(u: { uTime: { value: number }; uScale: { value: number }; uSpiral: { value: number } }) {
  const c = new Color(BLUE)
  return new ShaderMaterial({
    uniforms: { ...u, uColor: { value: new Vector3(c.r, c.g, c.b) } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uScale; uniform float uSpiral; uniform vec3 uColor;
      attribute float aSeed; attribute float aSide;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float life = fract(uTime * (0.12 + aSeed * 0.12) * (1.0 + uSpiral * 2.5) + aSeed * 31.0);
        float out_ = mix(life, 1.0 - life, uSpiral);
        vec3 p = position + vec3(0.0, 0.0, aSide) * (0.05 + out_ * (1.4 + aSeed * 1.2));
        p.y += sin(uTime * 0.8 + aSeed * 30.0) * 0.25 * life + life * 0.6 * (aSeed - 0.4);
        p.x += sin(uTime * 0.6 + aSeed * 50.0) * 0.3 * life;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, (0.05 + 0.04 * fract(aSeed * 9.7)) * uScale / -mv.z);
        vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - life);
        vColor = mix(uColor, vec3(1.0), 0.35) * (1.0 + uSpiral);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        if (vAlpha < 0.01) discard;
        gl_FragColor = vec4(vColor * 1.8 * vAlpha, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

/** A soft blue pool of light on the planks, both sides of the frame (additive). */
function poolMaterial() {
  const c = new Color(BLUE)
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Vector3(c.r, c.g, c.b) }, uLevel: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uLevel; varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * vec2(2.0, 2.0);
        // brightest at the frame (the middle row of the quad), fading out over ~2.5 m either side
        float k = exp(-p.x * p.x * 2.2) * exp(-p.y * p.y * 4.5);
        // in 1/16-block steps, like the hall's pixel light
        k = floor(k * 10.0) / 10.0;
        gl_FragColor = vec4(uColor * k * 0.35 * uLevel, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

export function DeckPortal({ frame }: { frame: BufferGeometry[] }) {
  const boost = useMemo(() => ({ value: 0 }), [])
  const frameMat = useMemo(() => frameMaterial(boost), [boost])
  const time = useMemo(() => ({ value: 0 }), [])
  const { surface, spiralAttr } = useMemo(() => {
    const geo = new PlaneGeometry(1, 1)
    const c = new Color(BLUE)
    geo.setAttribute('aColor', new InstancedBufferAttribute(new Float32Array([c.r, c.g, c.b]), 3))
    geo.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array([0.21]), 1))
    geo.setAttribute('aLevel', new InstancedBufferAttribute(new Float32Array([1]), 1))
    geo.setAttribute('aFill', new InstancedBufferAttribute(new Float32Array([1]), 1))
    const spiralAttr = new InstancedBufferAttribute(new Float32Array([0, 0, 1]), 3)
    geo.setAttribute('aSpiral', spiralAttr)
    const mesh = new InstancedMesh(geo, surfaceMaterial({ time, fog: FOG_DENSITY, side: DoubleSide }), 1)
    mesh.setMatrixAt(0, new Matrix4().compose(new Vector3(...PORTAL.center), new Quaternion(), new Vector3(PORTAL.width, PORTAL.height, 1)))
    mesh.frustumCulled = false
    return { surface: mesh, spiralAttr }
  }, [time])
  const moteU = useMemo(() => ({ uTime: { value: 0 }, uScale: { value: 800 }, uSpiral: { value: 0 } }), [])
  const { moteGeo, moteMat, poolGeo, poolMat } = useMemo(
    () => ({ moteGeo: motes(), moteMat: moteMaterial(moteU), poolGeo: new PlaneGeometry(PORTAL.width + 2, 5.2), poolMat: poolMaterial() }),
    [moteU],
  )
  useEffect(
    () => () => {
      frameMat.dispose()
      surface.geometry.dispose()
      ;(surface.material as ShaderMaterial).dispose()
      surface.dispose()
      moteGeo.dispose()
      moteMat.dispose()
      poolGeo.dispose()
      poolMat.dispose()
    },
    [frameMat, surface, moteGeo, moteMat, poolGeo, poolMat],
  )

  const spiralClock = useMemo(() => ({ t: 0 }), [])
  useFrame(({ gl, camera }, dt) => {
    time.value += dt
    const sp = shipFx.spiral
    spiralClock.t += dt * sp * 1.5
    spiralAttr.array[0] = sp
    spiralAttr.array[1] = spiralClock.t
    spiralAttr.needsUpdate = true
    moteU.uTime.value += dt
    moteU.uSpiral.value = sp
    moteU.uScale.value = gl.domElement.height / (2 * Math.tan((((camera as { fov?: number }).fov ?? 60) * Math.PI) / 360))
    boost.value = shipFx.flare
    poolMat.uniforms.uLevel.value = 1 + shipFx.flare * 1.5 + sp
  })

  return (
    <group name="deck-portal">
      {frame.map((g, i) => (
        <mesh key={i} geometry={g} material={frameMat} castShadow receiveShadow />
      ))}
      <primitive object={surface} />
      <points geometry={moteGeo} material={moteMat} frustumCulled={false} renderOrder={5} />
      <mesh geometry={poolGeo} material={poolMat} position={[0, DECK.y + 0.015, PORTAL.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4} />
    </group>
  )
}
