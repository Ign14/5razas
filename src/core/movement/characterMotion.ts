import { cellToScreen, screenDirToCellDir } from '../math/iso.ts';
import { normalize, scale, type Vec2 } from '../math/vector.ts';
import { moveWithCollisions, type CollisionMap } from '../world/collision.ts';
import { directionFromScreenVector, type Direction } from './direction.ts';

export interface MotionParams {
  /** Velocidad en celdas por segundo (espacio lógico, no en píxeles). */
  readonly moveSpeed: number;
  readonly colliderHalfSize: number;
}

export interface MotionState {
  readonly position: Vec2;
  readonly facing: Direction;
  readonly moving: boolean;
}

/** Límite de dt para que una pausa del navegador no provoque saltos enormes. */
export const MAX_DT_SECONDS = 0.1;

/**
 * Avanza el movimiento continuo de un personaje sobre la cuadrícula lógica.
 * `screenIntent` es la dirección deseada en pantalla (p. ej. WASD), de longitud 0 o 1.
 * La velocidad es constante en el espacio de celdas, de modo que las distancias del mundo
 * no dependen de la proyección.
 */
export function stepMotion(
  state: MotionState,
  screenIntent: Vec2,
  dtSeconds: number,
  map: CollisionMap,
  params: MotionParams,
): MotionState {
  const facing = directionFromScreenVector(screenIntent);
  return advance(state, normalize(screenDirToCellDir(screenIntent)), facing, dtSeconds, map, params);
}

/**
 * Variante para entidades controladas por IA: la dirección ya está expresada en celdas.
 * La orientación visual se obtiene proyectando la dirección a pantalla.
 */
export function stepMotionCells(
  state: MotionState,
  cellDir: Vec2,
  dtSeconds: number,
  map: CollisionMap,
  params: MotionParams,
): MotionState {
  const dir = normalize(cellDir);
  return advance(state, dir, directionFromScreenVector(cellToScreen(dir)), dtSeconds, map, params);
}

function advance(
  state: MotionState,
  cellDir: Vec2,
  facing: Direction | null,
  dtSeconds: number,
  map: CollisionMap,
  params: MotionParams,
): MotionState {
  const dt = Math.min(Math.max(dtSeconds, 0), MAX_DT_SECONDS);
  if (facing === null || dt === 0 || params.moveSpeed <= 0) {
    return { position: state.position, facing: facing ?? state.facing, moving: false };
  }
  const delta = scale(cellDir, params.moveSpeed * dt);
  const result = moveWithCollisions(map, state.position, delta, { halfSize: params.colliderHalfSize });
  const moved = result.position.x !== state.position.x || result.position.y !== state.position.y;
  return { position: result.position, facing, moving: moved };
}
