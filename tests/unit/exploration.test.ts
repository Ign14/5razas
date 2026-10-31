import { describe, expect, it } from 'vitest';
import { ExplorationState } from '../../src/core/world/exploration.ts';

describe('niebla de exploración', () => {
  it('revela un círculo y reporta solo las celdas nuevas', () => {
    const e = new ExplorationState(20, 20);
    const first = e.reveal({ x: 10.5, y: 10.5 }, 2);
    expect(first.length).toBe(13);
    expect(e.isExplored(10, 10)).toBe(true);
    expect(e.isExplored(12, 12)).toBe(false);
    expect(e.reveal({ x: 10.5, y: 10.5 }, 2)).toHaveLength(0);
    expect(e.exploredCount).toBe(13);
  });

  it('recorta en los bordes del mapa', () => {
    const e = new ExplorationState(5, 5);
    e.reveal({ x: 0, y: 0 }, 10);
    expect(e.exploredCount).toBe(25);
    expect(e.isExplored(-1, 0)).toBe(false);
  });
});
