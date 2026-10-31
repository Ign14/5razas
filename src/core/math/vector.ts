/** Vector 2D inmutable usado por la lógica del juego (sin dependencia de Phaser). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/** Normaliza el vector; devuelve (0,0) para vectores nulos. */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  return len === 0 ? ZERO : { x: v.x / len, y: v.y / len };
}

export function scale(v: Vec2, k: number): Vec2 {
  return { x: v.x * k, y: v.y * k };
}
