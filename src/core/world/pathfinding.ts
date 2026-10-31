import type { Vec2 } from '../math/vector.ts';
import type { CollisionMap } from './collision.ts';

export interface Cell {
  readonly x: number;
  readonly y: number;
}

const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Montículo binario mínimo de índices de celda ordenados por coste estimado. */
class MinHeap {
  private readonly items: number[] = [];
  private readonly score: Float64Array;

  constructor(score: Float64Array) {
    this.score = score;
  }

  get size(): number {
    return this.items.length;
  }

  push(i: number): void {
    const a = this.items;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if ((this.score[a[p] as number] as number) <= (this.score[i] as number)) break;
      a[c] = a[p] as number;
      c = p;
    }
    a[c] = i;
  }

  pop(): number {
    const a = this.items;
    const top = a[0] as number;
    const last = a.pop() as number;
    if (a.length > 0) {
      let c = 0;
      const s = this.score[last] as number;
      for (;;) {
        const l = 2 * c + 1;
        if (l >= a.length) break;
        const r = l + 1;
        const m = r < a.length && (this.score[a[r] as number] as number) < (this.score[a[l] as number] as number) ? r : l;
        if ((this.score[a[m] as number] as number) >= s) break;
        a[c] = a[m] as number;
        c = m;
      }
      a[c] = last;
    }
    return top;
  }
}

/**
 * A* sobre la cuadrícula lógica con 8 vecinos, sin cortar esquinas bloqueadas.
 * Devuelve la secuencia de celdas desde `start` (excluida) hasta `goal` (incluida),
 * o null si no hay camino dentro del límite de nodos explorados.
 */
export function findPath(map: CollisionMap, start: Cell, goal: Cell, maxNodes = 4000): Cell[] | null {
  const { width: W, height: H } = map;
  if (map.isBlocked(goal.x, goal.y) || map.isBlocked(start.x, start.y)) return null;
  const idx = (x: number, y: number) => y * W + x;
  const startI = idx(start.x, start.y);
  const goalI = idx(goal.x, goal.y);
  if (startI === goalI) return [];

  const g = new Float64Array(W * H).fill(Infinity);
  const f = new Float64Array(W * H).fill(Infinity);
  const from = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); // Distancia octil.
  };
  const open = new MinHeap(f);
  g[startI] = 0;
  f[startI] = h(start.x, start.y);
  open.push(startI);

  let explored = 0;
  while (open.size > 0 && explored < maxNodes) {
    const cur = open.pop();
    if (closed[cur] === 1) continue;
    if (cur === goalI) {
      const path: Cell[] = [];
      for (let i = cur; i !== startI; i = from[i] as number) path.push({ x: i % W, y: Math.floor(i / W) });
      return path.reverse();
    }
    closed[cur] = 1;
    explored++;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (map.isBlocked(nx, ny)) continue;
      // Evitar cortar esquinas: ambos ortogonales deben estar libres.
      if (dx !== 0 && dy !== 0 && (map.isBlocked(cx + dx, cy) || map.isBlocked(cx, cy + dy))) continue;
      const ni = idx(nx, ny);
      if (closed[ni] === 1) continue;
      const tentative = (g[cur] as number) + cost;
      if (tentative < (g[ni] as number)) {
        g[ni] = tentative;
        f[ni] = tentative + h(nx, ny);
        from[ni] = cur;
        open.push(ni);
      }
    }
  }
  return null;
}

/** ¿Se puede caminar en línea recta de `a` a `b` con un collider de medio lado `half`? */
export function hasClearPath(map: CollisionMap, a: Vec2, b: Vec2, half: number): boolean {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(dist / 0.25));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    for (const [ox, oy] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const) {
      if (map.isBlocked(Math.floor(x + ox), Math.floor(y + oy))) return false;
    }
  }
  return true;
}
