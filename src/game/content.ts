import { parseAbilityCatalog } from '../core/combat/abilities.ts';
import { parseStatusCatalog } from '../core/combat/statusEffects.ts';
import { parseCharacterConfig } from '../core/data/characterConfig.ts';
import { DataValidationError } from '../core/data/validate.ts';
import { parseCreatureCatalog } from '../core/creatures/creatureCatalog.ts';
import { parseRecipeBook } from '../core/alchemy/alchemy.ts';
import { parseElementCatalog } from '../core/alchemy/elements.ts';
import { parsePlantCatalog } from '../core/ecosystem/plants.ts';
import { parseEquipmentSets } from '../core/items/equipmentSets.ts';
import { parseItemCatalog } from '../core/items/itemCatalog.ts';
import { parseLootTables } from '../core/items/lootTables.ts';
import { parseProfession } from '../core/professions/profession.ts';
import { parseProgression } from '../core/progression/progression.ts';
import { validateContentReferences, type SimulationContent } from '../core/simulation/worldSimulation.ts';
import { parseTileCatalog, type TileCatalog } from '../core/world/tileCatalog.ts';
import { parseTiledMap } from '../core/world/tiledLoader.ts';
import { parseClockConfig } from '../core/world/worldClock.ts';
import recipesJson from '../data/alchemy/recipes.json';
import elementsJson from '../data/alchemy/elements.json';
import playerJson from '../data/characters/provisional-player.json';
import abilitiesJson from '../data/combat/abilities.json';
import statusesJson from '../data/combat/statuses.json';
import controlsJson from '../data/controls.json';
import creaturesJson from '../data/creatures/creatures.json';
import setsJson from '../data/items/equipmentSets.json';
import itemsJson from '../data/items/items.json';
import lootJson from '../data/items/lootTables.json';
import mapJson from '../data/maps/bosque-inicial.json';
import plantsJson from '../data/plants.json';
import guardianJson from '../data/professions/guardian-del-bosque.json';
import progressionJson from '../data/progression.json';
import tilesJson from '../data/tiles.json';
import worldJson from '../data/world.json';

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
    items: parseItemCatalog(itemsJson, 'data/items/items.json'),
    sets: parseEquipmentSets(setsJson, 'data/items/equipmentSets.json'),
    lootTables: parseLootTables(lootJson, 'data/items/lootTables.json'),
    progression: parseProgression(progressionJson, 'data/progression.json'),
    plants: parsePlantCatalog(plantsJson, 'data/plants.json'),
    clock: parseClockConfig(worldJson, 'data/world.json'),
    elements: parseElementCatalog(elementsJson, 'data/alchemy/elements.json'),
    recipes: parseRecipeBook(recipesJson, 'data/alchemy/recipes.json'),
    controlsRaw: controlsJson,
  };
  const problems = validateContentReferences(content);
  if (problems.length > 0) throw new DataValidationError('referencias entre archivos', problems);
  return content;
}
