import { normalize, type Vec2 } from '../math/vector.ts';

/** Ocho orientaciones expresadas en el espacio de pantalla (n = arriba en el monitor). */
export const DIRECTIONS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Estado de las acciones de movimiento, desacoplado de las teclas concretas. */
export interface MoveInput {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

/** Convierte el estado de entrada en un vector de intención en pantalla, normalizado. */
export function intentFromInput(input: MoveInput): Vec2 {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  return normalize({ x, y });
}

/** Orientación de 8 sectores para un vector de pantalla; null si es nulo. */
export function directionFromScreenVector(v: Vec2): Direction | null {
  if (v.x === 0 && v.y === 0) return null;
  const angle = Math.atan2(v.y, v.x); // y hacia abajo: ángulo horario desde el este.
  const sector = Math.round(angle / (Math.PI / 4));
  return DIRECTIONS[((sector % 8) + 8) % 8] as Direction;
}

/** Ángulo (radianes, pantalla) asociado a cada orientación. */
export function directionAngle(d: Direction): number {
  return DIRECTIONS.indexOf(d) * (Math.PI / 4);
}
