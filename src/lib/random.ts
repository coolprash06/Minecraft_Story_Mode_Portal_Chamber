/** Seeded PRNG (mulberry32): same seed, same hall, every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable 0..1 hash of an integer cell coordinate. */
export function hash3(x: number, y: number, z: number, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const damp = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt)
