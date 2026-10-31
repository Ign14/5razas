import type { CollisionMap } from './collision.ts';

export interface Obstacle {
  readonly x: number;
  readonly y: number;
  readonly until: number;
}

/**
 * Capa de colisión con obstáculos temporales (p. ej. raíces que hace brotar un jefe) sobre el mapa base.
 * Todos los sistemas que mueven entidades usan esta capa, no el mapa directamente.
 */
export class DynamicObstacles implements CollisionMap {
  readonly width: number;
  readonly height: number;
  private readonly base: CollisionMap;
  private readonly cells = new Map<number, Obstacle>();

  constructor(base: CollisionMap) {
    this.base = base;
    this.width = base.width;
    this.height = base.height;
  }

  isBlocked(x: number, y: number): boolean {
    return this.base.isBlocked(x, y) || this.cells.has(y * this.width + x);
  }

  /** Coloca un obstáculo si la celda está libre. Devuelve el obstáculo o null. */
  add(x: number, y: number, until: number): Obstacle | null {
    if (this.isBlocked(x, y)) return null;
    const o = { x, y, until };
    this.cells.set(y * this.width + x, o);
    return o;
  }

  all(): IterableIterator<Obstacle> {
    return this.cells.values();
  }

  /** Retira los obstáculos vencidos y los devuelve. */
  expire(time: number): Obstacle[] {
    const gone: Obstacle[] = [];
    for (const [k, o] of this.cells) {
      if (time < o.until) continue;
      this.cells.delete(k);
      gone.push(o);
    }
    return gone;
  }

  clear(): Obstacle[] {
    const all = [...this.cells.values()];
    this.cells.clear();
    return all;
  }
}
