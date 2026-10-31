import { describe, expect, it } from 'vitest';
import { Navigator } from '../../src/core/ai/navigator.ts';
import { moveWithCollisions, type CollisionMap } from '../../src/core/world/collision.ts';
import { findPath, hasClearPath } from '../../src/core/world/pathfinding.ts';
import { scale } from '../../src/core/math/vector.ts';

function asciiMap(rows: string[]): CollisionMap {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    isBlocked: (x, y) => { const c = rows[y]?.charAt(x); return c === undefined || c === '' || c === '#'; },
  };
}

// Muro con una sola abertura abajo.
const walled = asciiMap([
  '..........',
  '....#.....',
  '....#.....',
  '....#.....',
  '....#.....',
  '..........',
]);

describe('A*', () => {
  it('rodea un muro por la abertura', () => {
    const path = findPath(walled, { x: 1, y: 2 }, { x: 8, y: 2 });
    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual({ x: 8, y: 2 });
    expect(path?.every((c) => !walled.isBlocked(c.x, c.y))).toBe(true);
    // Debe pasar por la fila superior o inferior (y = 0 o y = 5) en x = 4.
    expect(path?.some((c) => c.x === 4 && (c.y === 0 || c.y === 5))).toBe(true);
  });

  it('no corta esquinas y devuelve null si no hay camino', () => {
    const corner = asciiMap(['.#', '#.']);
    expect(findPath(corner, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    const closed = asciiMap(['.#.', '###', '...']);
    expect(findPath(closed, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull();
  });

  it('detecta línea recta despejada', () => {
    expect(hasClearPath(walled, { x: 1.5, y: 2.5 }, { x: 8.5, y: 2.5 }, 0.3)).toBe(false);
    expect(hasClearPath(walled, { x: 1.5, y: 5.5 }, { x: 8.5, y: 5.5 }, 0.3)).toBe(true);
  });

  it('el navegador lleva a una entidad al otro lado del muro', () => {
    const nav = new Navigator(walled, 0.3);
    let pos = { x: 1.5, y: 2.5 };
    const goal = { x: 8.5, y: 2.5 };
    for (let t = 0; t < 10 && Math.hypot(goal.x - pos.x, goal.y - pos.y) > 0.3; t += 1 / 30) {
      const dir = nav.directionTo(pos, goal, t);
      pos = moveWithCollisions(walled, pos, scale(dir, 3 / 30), { halfSize: 0.3 }).position;
    }
    expect(Math.hypot(goal.x - pos.x, goal.y - pos.y)).toBeLessThan(0.4);
  });
});
