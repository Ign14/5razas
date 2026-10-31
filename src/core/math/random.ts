/** Utilidades pseudoaleatorias deterministas (sin dependencias externas). */

/** Hash entero determinista de una coordenada 2D, en [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Ruido de valor 2D suavizado, en [0, 1). */
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const top = lerp(hash2(x0, y0, seed), hash2(x0 + 1, y0, seed), sx);
  const bottom = lerp(hash2(x0, y0 + 1, seed), hash2(x0 + 1, y0 + 1, seed), sx);
  return lerp(top, bottom, sy);
}

/** Ruido fractal (varias octavas de valueNoise), en [0, 1). */
export function fractalNoise(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * freq, y * freq, seed + o * 1013) * amp;
    norm += amp;
    amp /= 2;
    freq *= 2;
  }
  return sum / norm;
}
