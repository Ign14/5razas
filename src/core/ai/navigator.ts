import { normalize, sub, ZERO, type Vec2 } from '../math/vector.ts';
import type { CollisionMap } from '../world/collision.ts';
import { findPath, hasClearPath, type Cell } from '../world/pathfinding.ts';

/** Segundos entre recálculos de ruta mientras el destino no cambie de celda. */
const REPATH_INTERVAL = 0.6;

/**
 * Guía a una entidad hacia un destino: en línea recta si está despejado, o siguiendo una ruta A*
 * (recalculada con moderación para no cargar la CPU con muchas criaturas).
 */
export class Navigator {
  private readonly map: CollisionMap;
  private readonly half: number;
  private path: Cell[] = [];
  private goalCell: Cell | null = null;
  private nextRepathAt = 0;

  constructor(map: CollisionMap, colliderHalfSize: number) {
    this.map = map;
    this.half = colliderHalfSize;
  }

  /** Dirección normalizada hacia el siguiente punto de la ruta, o (0,0) si no hay ruta. */
  directionTo(from: Vec2, to: Vec2, time: number): Vec2 {
    if (hasClearPath(this.map, from, to, this.half)) {
      this.path = [];
      return normalize(sub(to, from));
    }
    const goal = { x: Math.floor(to.x), y: Math.floor(to.y) };
    const goalChanged = this.goalCell?.x !== goal.x || this.goalCell.y !== goal.y;
    if (goalChanged || time >= this.nextRepathAt || this.path.length === 0) {
      this.goalCell = goal;
      this.nextRepathAt = time + REPATH_INTERVAL;
      this.path = findPath(this.map, { x: Math.floor(from.x), y: Math.floor(from.y) }, goal) ?? [];
    }
    // Avanzar al punto más lejano de la ruta visible en línea recta (suaviza el zigzag).
    while (this.path.length > 1) {
      const next = this.path[1] as Cell;
      if (!hasClearPath(this.map, from, { x: next.x + 0.5, y: next.y + 0.5 }, this.half)) break;
      this.path.shift();
    }
    const wp = this.path[0];
    if (!wp) return ZERO;
    const target = { x: wp.x + 0.5, y: wp.y + 0.5 };
    if (Math.hypot(target.x - from.x, target.y - from.y) < 0.15) this.path.shift();
    return normalize(sub(target, from));
  }
}
