import type { MapLayerId } from '../../core/world/tileCatalog.ts';

/**
 * Bandas de profundidad por capa (GAME_DESIGN §3.2).
 * Las capas planas tienen profundidad fija; objetos y entidades comparten una banda
 * ordenada por la coordenada Y de pantalla de su base, para resolver oclusiones.
 */
export const LAYER_DEPTH: Readonly<Record<Exclude<MapLayerId, 'objects'>, number>> = {
  ground: 0,
  detail: 1,
  paths: 2,
};

const SORTED_BAND_START = 100;
/** Desempate para que una entidad sobre la misma fila que un objeto se dibuje delante. */
export const ENTITY_DEPTH_BIAS = 0.5;

export function sortedDepth(screenY: number): number {
  return SORTED_BAND_START + screenY;
}

/** Banda de elementos superiores / efectos atmosféricos (reservada). */
export const OVERLAY_DEPTH = 1_000_000;
