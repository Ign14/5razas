import { parseAbilityCatalog } from '../core/combat/abilities.ts';
import { parseStatusCatalog } from '../core/combat/statusEffects.ts';
import { parseCharacterConfig } from '../core/data/characterConfig.ts';
import { DataValidationError } from '../core/data/validate.ts';
import { parseCreatureCatalog } from '../core/creatures/creatureCatalog.ts';
import { parseProfession } from '../core/professions/profession.ts';
import { validateContentReferences, type SimulationContent } from '../core/simulation/worldSimulation.ts';
import { parseTileCatalog, type TileCatalog } from '../core/world/tileCatalog.ts';
import { parseTiledMap } from '../core/world/tiledLoader.ts';
import playerJson from '../data/characters/provisional-player.json';
import abilitiesJson from '../data/combat/abilities.json';
import statusesJson from '../data/combat/statuses.json';
import controlsJson from '../data/controls.json';
import creaturesJson from '../data/creatures/creatures.json';
import mapJson from '../data/maps/bosque-inicial.json';
import guardianJson from '../data/professions/guardian-del-bosque.json';
import tilesJson from '../data/tiles.json';

/** Contenido del juego ya validado. Se carga una sola vez en BootScene. */
export interface GameContent extends SimulationContent {
  readonly catalog: TileCatalog;
  readonly controlsRaw: unknown;
}

export function loadContent(): GameContent {
  const catalog = parseTileCatalog(tilesJson, 'data/tiles.json');
  const content: GameContent = {
    catalog,
    map: parseTiledMap(mapJson, catalog, 'data/maps/bosque-inicial.json'),
    character: parseCharacterConfig(playerJson, 'data/characters/provisional-player.json'),
    profession: parseProfession(guardianJson, 'data/professions/guardian-del-bosque.json'),
    abilities: parseAbilityCatalog(abilitiesJson, 'data/combat/abilities.json'),
    statuses: parseStatusCatalog(statusesJson, 'data/combat/statuses.json'),
    creatures: parseCreatureCatalog(creaturesJson, 'data/creatures/creatures.json'),
    controlsRaw: controlsJson,
  };
  const problems = validateContentReferences(content);
  if (problems.length > 0) throw new DataValidationError('referencias entre archivos', problems);
  return content;
}
