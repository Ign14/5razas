import { parseCharacterConfig, type CharacterConfig } from '../core/data/characterConfig.ts';
import { parseTileCatalog, type TileCatalog } from '../core/world/tileCatalog.ts';
import { parseTiledMap } from '../core/world/tiledLoader.ts';
import type { WorldMap } from '../core/world/worldMap.ts';
import playerJson from '../data/characters/provisional-player.json';
import controlsJson from '../data/controls.json';
import mapJson from '../data/maps/bosque-inicial.json';
import tilesJson from '../data/tiles.json';

/** Contenido del juego ya validado. Se carga una sola vez en BootScene. */
export interface GameContent {
  readonly catalog: TileCatalog;
  readonly startingMap: WorldMap;
  readonly player: CharacterConfig;
  readonly controlsRaw: unknown;
}

export function loadContent(): GameContent {
  const catalog = parseTileCatalog(tilesJson, 'data/tiles.json');
  return {
    catalog,
    startingMap: parseTiledMap(mapJson, catalog, 'data/maps/bosque-inicial.json'),
    player: parseCharacterConfig(playerJson, 'data/characters/provisional-player.json'),
    controlsRaw: controlsJson,
  };
}
