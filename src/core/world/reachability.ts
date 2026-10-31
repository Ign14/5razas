import type { CollisionMap } from './collision.ts';

/** Cuenta las celdas transitables alcanzables desde `start` (vecindad de 4). */
export function reachableCells(map: CollisionMap, start: { x: number; y: number }): number {
  if (map.isBlocked(start.x, start.y)) return 0;
  const seen = new Uint8Array(map.width * map.height);
  const stack = [start.x, start.y];
  seen[start.y * map.width + start.x] = 1;
  let count = 0;
  while (stack.length > 0) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    count++;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (map.isBlocked(nx, ny)) continue;
      const i = ny * map.width + nx;
      if (seen[i] === 1) continue;
      seen[i] = 1;
      stack.push(nx, ny);
    }
  }
  return count;
}
