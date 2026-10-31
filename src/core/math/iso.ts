import type { Vec2 } from './vector.ts';

/**
 * Proyección isométrica 2:1.
 *
 * Espacio lógico ("celdas"): la celda (i, j) ocupa [i, i+1) × [j, j+1).
 * Espacio de pantalla (píxeles del mundo): el vértice superior de la celda (0,0) está en (0,0).
 * La proyección es independiente de los datos del mundo (GAME_DESIGN §3.1).
 */
export interface IsoMetrics {
  readonly tileWidth: number;
  readonly tileHeight: number;
}

export const DEFAULT_ISO: IsoMetrics = Object.freeze({ tileWidth: 64, tileHeight: 32 });

/** Celdas → píxeles de pantalla. */
export function cellToScreen(p: Vec2, m: IsoMetrics = DEFAULT_ISO): Vec2 {
  return {
    x: (p.x - p.y) * (m.tileWidth / 2),
    y: (p.x + p.y) * (m.tileHeight / 2),
  };
}

/** Píxeles de pantalla → celdas (inversa exacta de cellToScreen). */
export function screenToCell(s: Vec2, m: IsoMetrics = DEFAULT_ISO): Vec2 {
  const a = s.x / (m.tileWidth / 2);
  const b = s.y / (m.tileHeight / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Centro en pantalla del rombo de la celda entera (i, j). */
export function tileCenterToScreen(i: number, j: number, m: IsoMetrics = DEFAULT_ISO): Vec2 {
  return cellToScreen({ x: i + 0.5, y: j + 0.5 }, m);
}

/**
 * Convierte una dirección expresada en pantalla (p. ej. W = arriba) a una dirección
 * en el espacio de celdas. El resultado no está normalizado.
 */
export function screenDirToCellDir(d: Vec2): Vec2 {
  return { x: (d.x + d.y) / 2, y: (d.y - d.x) / 2 };
}

/** Rectángulo de pantalla que contiene el mapa completo de width × height celdas. */
export function mapScreenBounds(width: number, height: number, m: IsoMetrics = DEFAULT_ISO) {
  const hw = m.tileWidth / 2;
  const hh = m.tileHeight / 2;
  return {
    x: -height * hw,
    y: 0,
    width: (width + height) * hw,
    height: (width + height) * hh,
  };
}
