import { describe, expect, it } from 'vitest';
import { cellToScreen, mapScreenBounds, screenDirToCellDir, screenToCell, tileCenterToScreen } from '../../src/core/math/iso.ts';

describe('proyección isométrica 2:1 (64 × 32)', () => {
  it('ubica el vértice superior de la celda (0,0) en el origen', () => {
    expect(cellToScreen({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('avanzar en x se desplaza abajo-derecha y en y abajo-izquierda', () => {
    expect(cellToScreen({ x: 1, y: 0 })).toEqual({ x: 32, y: 16 });
    expect(cellToScreen({ x: 0, y: 1 })).toEqual({ x: -32, y: 16 });
  });

  it('el centro de un tile está media altura bajo su vértice', () => {
    expect(tileCenterToScreen(0, 0)).toEqual({ x: 0, y: 16 });
    expect(tileCenterToScreen(3, 1)).toEqual({ x: 64, y: 80 });
  });

  it('screenToCell es la inversa de cellToScreen', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 12.25, y: 40.5 }, { x: 63.9, y: 0.1 }]) {
      const back = screenToCell(cellToScreen(p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('W (arriba en pantalla) se mueve hacia -x,-y en celdas', () => {
    const d = screenDirToCellDir({ x: 0, y: -1 });
    expect(d.x).toBeLessThan(0);
    expect(d.y).toBeLessThan(0);
    expect(d.x).toBeCloseTo(d.y);
    // Proyectada de vuelta debe apuntar recto hacia arriba.
    const s = cellToScreen(d);
    expect(s.x).toBeCloseTo(0);
    expect(s.y).toBeLessThan(0);
  });

  it('calcula los límites de pantalla de un mapa 64 × 64', () => {
    expect(mapScreenBounds(64, 64)).toEqual({ x: -2048, y: 0, width: 4096, height: 2048 });
  });
});
