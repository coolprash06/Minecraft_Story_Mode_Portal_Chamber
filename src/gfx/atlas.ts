/**
 * Block texture atlas.
 *
 * Each 16×16 tile sits in a 32×32 cell with an 8 px gutter that wraps the tile around, so linear
 * minification never pulls in a neighbouring tile. The mip chain is built by hand, per tile (box
 * filter in linear light, gutter re-wrapped at every level), and stops at a 2 px cell: WebGL2
 * immutable storage makes a partial chain complete, so the far floor never turns into a blur of
 * mixed tiles. Magnification is nearest → crisp pixels up close; minification is trilinear +
 * anisotropic → no shimmer on the long checkered floor.
 */
import { CanvasTexture, LinearMipmapLinearFilter, NearestFilter, NoColorSpace, SRGBColorSpace, type Texture } from 'three'
import { TILE_NAMES, TILE_SIZE, paintTiles, type TilePixels } from './tiles'

const CELL = TILE_SIZE * 2
const GUTTER = TILE_SIZE / 2
const COLS = 4
const ROWS = Math.ceil(TILE_NAMES.length / COLS)
export const ATLAS_W = COLS * CELL
export const ATLAS_H = ROWS * CELL
/** Number of mip levels (cell sizes 32, 16, 8, 4, 2). */
const LEVELS = 5

const toLin = (v: number) => Math.pow(v / 255, 2.2)
const toSrgb = (v: number) => Math.round(Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2) * 255)

/** Halve a square RGBA tile (box filter; in linear light for colour, plain for data). */
function downsample(px: TilePixels, size: number, srgb = true): TilePixels {
  const h = size >> 1
  const out = new Uint8ClampedArray(h * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < h; x++)
      for (let c = 0; c < 3; c++) {
        let s = 0
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const v = px[((y * 2 + dy) * size + x * 2 + dx) * 4 + c]
            s += srgb ? toLin(v) : v
          }
        out[(y * h + x) * 4 + c] = srgb ? toSrgb(s / 4) : Math.round(s / 4)
        out[(y * h + x) * 4 + 3] = 255
      }
  return out
}

function levelCanvas(tiles: TilePixels[][], level: number) {
  const cell = CELL >> level
  const gutter = GUTTER >> level
  const ts = TILE_SIZE >> level
  const c = document.createElement('canvas')
  c.width = ATLAS_W >> level
  c.height = ATLAS_H >> level
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(c.width, c.height)
  tiles.forEach((chain, t) => {
    const px = chain[level]
    const ox = (t % COLS) * cell
    const oy = Math.floor(t / COLS) * cell
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++) {
        const tx = (((x - gutter) % ts) + ts) % ts
        const ty = (((y - gutter) % ts) + ts) % ts
        const si = (ty * ts + tx) * 4
        const di = ((oy + y) * c.width + ox + x) * 4
        img.data[di] = px[si]
        img.data[di + 1] = px[si + 1]
        img.data[di + 2] = px[si + 2]
        img.data[di + 3] = 255
      }
  })
  ctx.putImageData(img, 0, 0)
  return c
}

export interface BlockAtlas {
  /** sRGB colour. */
  map: Texture
  /** G = roughness, B = metalness (linear data). */
  mr: Texture
}

let cached: BlockAtlas | null = null

function buildTexture(chains: TilePixels[][], srgb: boolean) {
  const levels = Array.from({ length: LEVELS }, (_, l) => levelCanvas(chains, l))
  const tex = new CanvasTexture(levels[0])
  tex.mipmaps = levels as unknown as typeof tex.mipmaps
  tex.generateMipmaps = false
  tex.flipY = false
  tex.magFilter = NearestFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.anisotropy = 8
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace
  tex.needsUpdate = true
  return tex
}

function chain(base: TilePixels, srgb: boolean) {
  const c = [base]
  for (let l = 1; l < LEVELS; l++) c.push(downsample(c[l - 1], TILE_SIZE >> (l - 1), srgb))
  return c
}

export function blockAtlas(): BlockAtlas {
  if (cached) return cached
  const tiles = paintTiles()
  cached = {
    map: buildTexture(tiles.map((t) => chain(t.px, true)), true),
    mr: buildTexture(tiles.map((t) => chain(t.mr, false)), false),
  }
  return cached
}

/** UV rectangle of a tile's 16×16 area (v grows downwards: flipY is off). */
export function tileUV(tile: number) {
  const x = (tile % COLS) * CELL + GUTTER
  const y = Math.floor(tile / COLS) * CELL + GUTTER
  return { u0: x / ATLAS_W, u1: (x + TILE_SIZE) / ATLAS_W, vTop: y / ATLAS_H, vBottom: (y + TILE_SIZE) / ATLAS_H }
}
