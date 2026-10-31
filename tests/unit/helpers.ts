import { parseAbilityCatalog } from '../../src/core/combat/abilities.ts';
import { Combatant, type CombatantInit } from '../../src/core/combat/combatant.ts';
import type { Stats } from '../../src/core/combat/stats.ts';
import { parseStatusCatalog } from '../../src/core/combat/statusEffects.ts';
import { parseCharacterConfig } from '../../src/core/data/characterConfig.ts';
import { parseCreatureCatalog } from '../../src/core/creatures/creatureCatalog.ts';
import { parseRecipeBook } from '../../src/core/alchemy/alchemy.ts';
import { parseElementCatalog } from '../../src/core/alchemy/elements.ts';
import { parsePlantCatalog } from '../../src/core/ecosystem/plants.ts';
import { parseEquipmentSets } from '../../src/core/items/equipmentSets.ts';
import { parseItemCatalog } from '../../src/core/items/itemCatalog.ts';
import { parseLootTables } from '../../src/core/items/lootTables.ts';
import { parseProfession } from '../../src/core/professions/profession.ts';
import { parseProgression } from '../../src/core/progression/progression.ts';
import type { SimulationContent } from '../../src/core/simulation/worldSimulation.ts';
import type { CollisionMap } from '../../src/core/world/collision.ts';
import { parseTileCatalog } from '../../src/core/world/tileCatalog.ts';
import { parseTiledMap } from '../../src/core/world/tiledLoader.ts';
import { parseClockConfig } from '../../src/core/world/worldClock.ts';
import recipesJson from '../../src/data/alchemy/recipes.json';
import elementsJson from '../../src/data/alchemy/elements.json';
import playerJson from '../../src/data/characters/provisional-player.json';
import abilitiesJson from '../../src/data/combat/abilities.json';
import statusesJson from '../../src/data/combat/statuses.json';
import creaturesJson from '../../src/data/creatures/creatures.json';
import setsJson from '../../src/data/items/equipmentSets.json';
import itemsJson from '../../src/data/items/items.json';
import lootJson from '../../src/data/items/lootTables.json';
import mapJson from '../../src/data/maps/bosque-inicial.json';
import plantsJson from '../../src/data/plants.json';
import guardianJson from '../../src/data/professions/guardian-del-bosque.json';
import progressionJson from '../../src/data/progression.json';
import tilesJson from '../../src/data/tiles.json';
import worldJson from '../../src/data/world.json';

/** Contenido real del juego, cargado igual que en BootScene pero sin Phaser. */
export function loadTestContent(): SimulationContent {
  const catalog = parseTileCatalog(tilesJson);
  return {
    map: parseTiledMap(mapJson, catalog, 'map'),
    character: parseCharacterConfig(playerJson, 'player'),
    profession: parseProfession(guardianJson, 'guardian'),
    abilities: parseAbilityCatalog(abilitiesJson, 'abilities'),
    statuses: parseStatusCatalog(statusesJson, 'statuses'),
    creatures: parseCreatureCatalog(creaturesJson, 'creatures'),
    items: parseItemCatalog(itemsJson, 'items'),
    sets: parseEquipmentSets(setsJson, 'sets'),
    lootTables: parseLootTables(lootJson, 'loot'),
    progression: parseProgression(progressionJson, 'progression'),
    plants: parsePlantCatalog(plantsJson, 'plants'),
    clock: parseClockConfig(worldJson, 'world'),
    elements: parseElementCatalog(elementsJson, 'elements'),
    recipes: parseRecipeBook(recipesJson, 'recipes'),
  };
}

export const statuses = parseStatusCatalog(statusesJson, 'statuses');
export const abilities = parseAbilityCatalog(abilitiesJson, 'abilities');

/** Campo abierto de 100 × 100 sin obstáculos. */
export const openField: CollisionMap = {
  width: 100,
  height: 100,
  isBlocked: (x, y) => x < 0 || y < 0 || x >= 100 || y >= 100,
};

export const baseStats: Stats = {
  life: 100,
  energy: 100,
  attack: 10,
  power: 10,
  defense: 0,
  resistance: 0,
  speed: 4,
  attackRate: 1,
  crit: 0,
  evasion: 0,
};

export function makeCombatant(overrides: Partial<CombatantInit> & { id: string }): Combatant {
  return new Combatant({
    team: 'hostile',
    position: { x: 50, y: 50 },
    stats: baseStats,
    level: 1,
    hurtboxRadius: 0.4,
    colliderHalfSize: 0.3,
    invulnerabilityOnHit: 0,
    poise: 0,
    energyRegen: 0,
    ...overrides,
  });
}

/** RNG que siempre devuelve el mismo valor (controla crítico/evasión/probabilidades). */
export const fixedRng = (v: number) => () => v;
