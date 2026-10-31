import type { Vec2 } from '../math/vector.ts';

/** Fuente de colisiones lógicas: una celda bloqueada es un cuadrado sólido de 1 × 1. */
export interface CollisionMap {
  readonly width: number;
  readonly height: number;
  /** Debe devolver true para celdas fuera del mapa. */
  isBlocked(cellX: number, cellY: number): boolean;
}

/** Caja alineada a los ejes del espacio de celdas, centrada en la posición de la entidad. */
export interface Collider {
  readonly halfSize: number;
}

const EPSILON = 1e-6;
/** Paso máximo por iteración, para evitar atravesar paredes con dt grandes. */
const MAX_STEP = 0.25;

function overlapsBlocked(map: CollisionMap, x: number, y: number, half: number): boolean {
  const minX = Math.floor(x - half);
  const maxX = Math.floor(x + half - EPSILON);
  const minY = Math.floor(y - half);
  const maxY = Math.floor(y + half - EPSILON);
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (map.isBlocked(cx, cy)) return true;
    }
  }
  return false;
}

/** Indica si un collider en la posición dada se superpone con alguna celda bloqueada. */
export function collides(map: CollisionMap, pos: Vec2, collider: Collider): boolean {
  return overlapsBlocked(map, pos.x, pos.y, collider.halfSize);
}

/** Mueve en un solo eje; devuelve true si el movimiento fue bloqueado. */
function moveAxis(
  map: CollisionMap,
  pos: { x: number; y: number },
  axis: 'x' | 'y',
  delta: number,
  half: number,
): boolean {
  if (delta === 0) return false;
  const previous = pos[axis];
  const next = previous + delta;
  const nx = axis === 'x' ? next : pos.x;
  const ny = axis === 'y' ? next : pos.y;
  if (!overlapsBlocked(map, nx, ny, half)) {
    pos[axis] = next;
    return false;
  }
  // Ajustar contra el borde de la celda bloqueada (permite deslizarse sobre la pared).
  const snapped =
    delta > 0
      ? Math.floor(next + half - EPSILON) - half - EPSILON
      : Math.floor(next - half) + 1 + half + EPSILON;
  // Solo se acepta un ajuste que avance en la dirección del movimiento: si ya se está
  // tocando la pared, el ajuste retrocedería una fracción y el personaje "vibraría".
  const advances = delta > 0 ? snapped > previous : snapped < previous;
  pos[axis] = advances ? snapped : previous;
  if (overlapsBlocked(map, pos.x, pos.y, half)) pos[axis] = previous;
  return true;
}

export interface MoveResult {
  readonly position: Vec2;
  readonly blockedX: boolean;
  readonly blockedY: boolean;
}

/**
 * Desplaza un collider resolviendo colisiones por ejes separados, lo que permite deslizarse
 * a lo largo de las paredes. Subdivide el movimiento para evitar el efecto túnel.
 */
export function moveWithCollisions(
  map: CollisionMap,
  start: Vec2,
  delta: Vec2,
  collider: Collider,
): MoveResult {
  const pos = { x: start.x, y: start.y };
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / MAX_STEP));
  const sx = delta.x / steps;
  const sy = delta.y / steps;
  let blockedX = false;
  let blockedY = false;
  for (let i = 0; i < steps; i++) {
    if (!blockedX) blockedX = moveAxis(map, pos, 'x', sx, collider.halfSize);
    if (!blockedY) blockedY = moveAxis(map, pos, 'y', sy, collider.halfSize);
  }
  return { position: { x: pos.x, y: pos.y }, blockedX, blockedY };
}
