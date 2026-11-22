/** Shared materials (created once). Every lit material receives the light field. */
import { Color, MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three'
import { blockAtlas } from './atlas'
import { lightField, withLightField } from './lightField'
import { portalFx } from './portalFx'
import { SLOT } from './voxel'

let blocks: MeshStandardMaterial | null = null
/** Voxel hall: colour atlas + roughness/metalness atlas + baked AO/tint in vertex colours. */
export function blockMaterial() {
  if (blocks) return blocks
  const atlas = blockAtlas()
  const P = lightField.portalLevels.value.length
  blocks = withLightField(
    new MeshStandardMaterial({ map: atlas.map, roughnessMap: atlas.mr, metalnessMap: atlas.mr, roughness: 1, metalness: 1, vertexColors: true }),
    {
      key: 'blocks',
      env: 0.2,
      uniforms: { uPortalLevel: lightField.portalLevels, uPortalColor: lightField.portalColors, uPortalBoost: portalFx.boost },
      vertexHead: 'attribute float aEmit; varying float vEmit;',
      vertex: 'vEmit = aEmit;',
      fragmentHead: `varying float vEmit; uniform float uPortalLevel[${P}]; uniform vec3 uPortalColor[${P}]; uniform float uPortalBoost[${P}];`,
      // Portal frame glow. aEmit = portal id + 1, +0.5 on faces lining the opening. A faint
      // gem glow in the portal's own colour while dormant (so frames read from the aisle), much
      // stronger once the portal is lit. Masked by the tile's R channel (bevels and glints).
      // uPortalBoost lifts it while hovered and flares it as the portal ignites (portalFx).
      fragment: /* glsl */ `
        if (vEmit > 0.5) {
          int pid = int(vEmit) - 1;
          float rim = fract(vEmit) > 0.25 ? 1.0 : 0.0;
          float lvl = uPortalLevel[pid];
          lvl = lvl * lvl * (3.0 - 2.0 * lvl);
          float mask = texture2D(roughnessMap, vRoughnessMapUv).r;
          totalEmissiveRadiance += uPortalColor[pid] * mask * (0.2 + 0.4 * rim + lvl * (1.0 + 1.4 * rim) + uPortalBoost[pid] * (0.8 + 0.8 * rim));
        }`,
    },
  )
  return blocks
}

let soulGold: MeshStandardMaterial | null = null
/**
 * The soul chandeliers' gold (and iron cages). Their own cyan light sits a hand's breadth away and
 * would turn yellow gold green, so this metal takes a reduced share of the field and keeps a
 * faint warm self-glow: it reads as gold catching a cool rim, not as green brass.
 */
export function soulGoldMaterial() {
  if (soulGold) return soulGold
  soulGold = withLightField(new MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.8 }), {
    key: 'soulGold',
    env: 1.6,
    fieldGain: 0.2,
    fragment: 'totalEmissiveRadiance += diffuseColor.rgb * vec3(0.16, 0.11, 0.05);',
  })
  return soulGold
}

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
