import { describe, expect, it } from 'vitest';
import { MAX_DT_SECONDS, stepMotion, type MotionState } from '../../src/core/movement/characterMotion.ts';
import { directionFromScreenVector, intentFromInput } from '../../src/core/movement/direction.ts';
import type { CollisionMap } from '../../src/core/world/collision.ts';

const openField: CollisionMap = {
  width: 100,
  height: 100,
  isBlocked: (x, y) => x < 0 || y < 0 || x >= 100 || y >= 100,
};
const params = { moveSpeed: 4, colliderHalfSize: 0.3 };
const start: MotionState = { position: { x: 50, y: 50 }, facing: 's', moving: false };
const none = { up: false, down: false, left: false, right: false };

describe('entrada de movimiento', () => {
  it('normaliza las diagonales', () => {
    const v = intentFromInput({ ...none, up: true, right: true });
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });

  it('teclas opuestas se anulan', () => {
    expect(intentFromInput({ ...none, left: true, right: true })).toEqual({ x: 0, y: 0 });
  });

  it('calcula 8 orientaciones en pantalla', () => {
    expect(directionFromScreenVector({ x: 0, y: -1 })).toBe('n');
    expect(directionFromScreenVector({ x: 1, y: 0 })).toBe('e');
    expect(directionFromScreenVector({ x: -1, y: 1 })).toBe('sw');
    expect(directionFromScreenVector({ x: 0, y: 0 })).toBeNull();
  });
});

describe('stepMotion', () => {
  it('avanza a velocidad constante en celdas por segundo', () => {
    const next = stepMotion(start, intentFromInput({ ...none, right: true }), 0.05, openField, params);
    const dist = Math.hypot(next.position.x - 50, next.position.y - 50);
    expect(dist).toBeCloseTo(4 * 0.05);
    expect(next.facing).toBe('e');
    expect(next.moving).toBe(true);
  });

  it('la misma distancia lógica en todas las direcciones', () => {
    for (const input of [{ up: true }, { left: true }, { down: true, right: true }]) {
      const n = stepMotion(start, intentFromInput({ ...none, ...input }), 0.05, openField, params);
      expect(Math.hypot(n.position.x - 50, n.position.y - 50)).toBeCloseTo(0.2);
    }
  });

  it('conserva la orientación al detenerse', () => {
    const moved = stepMotion(start, intentFromInput({ ...none, up: true }), 0.016, openField, params);
    const stopped = stepMotion(moved, { x: 0, y: 0 }, 0.016, openField, params);
    expect(stopped.facing).toBe('n');
    expect(stopped.moving).toBe(false);
    expect(stopped.position).toEqual(moved.position);
  });

  it('limita dt para evitar saltos tras una pausa', () => {
    const n = stepMotion(start, intentFromInput({ ...none, right: true }), 5, openField, params);
    expect(Math.hypot(n.position.x - 50, n.position.y - 50)).toBeCloseTo(4 * MAX_DT_SECONDS);
  });

  it('marca moving=false al empujar contra una pared', () => {
    const wall: CollisionMap = { ...openField, isBlocked: (x) => x >= 51 };
    const atWall: MotionState = { ...start, position: { x: 50.7, y: 50.5 } };
    // Abajo-derecha en pantalla equivale a +x puro en celdas: empuja directamente la pared.
    const n = stepMotion(atWall, { x: 1, y: 1 }, 0.05, wall, params);
    expect(n.moving).toBe(false);
    expect(n.position).toEqual(atWall.position);
  });
});
