import { describe, expect, it } from 'vitest';
import { collides, moveWithCollisions, type CollisionMap } from '../../src/core/world/collision.ts';

/** Mapa de prueba a partir de un dibujo ASCII: '#' = bloqueado. */
function asciiMap(rows: string[]): CollisionMap {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    isBlocked(x, y) {
      const row = rows[y];
      if (row === undefined || x < 0 || x >= row.length) return true;
      return row[x] === '#';
    },
  };
}

const collider = { halfSize: 0.3 };

describe('colisiones sobre la cuadrícula lógica', () => {
  const room = asciiMap(['#######', '#.....#', '#..#..#', '#.....#', '#######']);

  it('detecta superposición con celdas bloqueadas', () => {
    expect(collides(room, { x: 1.5, y: 1.5 }, collider)).toBe(false);
    expect(collides(room, { x: 1.2, y: 1.5 }, collider)).toBe(true);
    expect(collides(room, { x: 3.5, y: 2.5 }, collider)).toBe(true);
  });

  it('se mueve libremente cuando no hay obstáculos', () => {
    const r = moveWithCollisions(room, { x: 1.5, y: 1.5 }, { x: 1, y: 0 }, collider);
    expect(r.position.x).toBeCloseTo(2.5);
    expect(r.blockedX).toBe(false);
  });

  it('se detiene contra una pared sin atravesarla', () => {
    const r = moveWithCollisions(room, { x: 4.5, y: 1.5 }, { x: 5, y: 0 }, collider);
    expect(r.blockedX).toBe(true);
    expect(r.position.x).toBeLessThan(6 - 0.3 + 1e-3);
    expect(r.position.x).toBeGreaterThan(5.6);
    expect(collides(room, r.position, collider)).toBe(false);
  });

  it('se desliza a lo largo de una pared con movimiento diagonal', () => {
    const r = moveWithCollisions(room, { x: 2.5, y: 1.5 }, { x: 1, y: -1 }, collider);
    expect(r.blockedY).toBe(true);
    expect(r.blockedX).toBe(false);
    expect(r.position.x).toBeCloseTo(3.5);
    expect(r.position.y).toBeCloseTo(1.3, 3);
  });

  it('no atraviesa paredes delgadas con desplazamientos grandes (anti-túnel)', () => {
    const corridor = asciiMap(['..#..']);
    const r = moveWithCollisions(corridor, { x: 0.5, y: 0.5 }, { x: 4, y: 0 }, { halfSize: 0.2 });
    expect(r.position.x).toBeLessThan(2);
  });

  it('trata el exterior del mapa como bloqueado', () => {
    const open = asciiMap(['...', '...', '...']);
    const r = moveWithCollisions(open, { x: 0.5, y: 0.5 }, { x: -3, y: -3 }, collider);
    expect(r.position.x).toBeCloseTo(0.3, 3);
    expect(r.position.y).toBeCloseTo(0.3, 3);
  });
});
