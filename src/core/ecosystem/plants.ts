import { ID_PATTERN, Issues } from '../data/validate.ts';
import { RARITIES, type Rarity } from '../items/itemCatalog.ts';
import type { Rng } from '../math/random.ts';
import type { Vec2 } from '../math/vector.ts';
import { inHourRange, parseHourRange, type HourRange } from '../world/worldClock.ts';
import type { GatherZone, WorldMap } from '../world/worldMap.ts';

/** Propiedades alquímicas (GAME_DESIGN §10.3). Mecánicas fantásticas, no propiedades reales de plantas. */
export const ALCHEMY_ELEMENTS = ['fire', 'ice', 'poison', 'lightning', 'wind', 'vital'] as const;
export type AlchemyElement = (typeof ALCHEMY_ELEMENTS)[number];

export interface PlantDefinition {
  readonly id: string;
  readonly name: string;
  /** Objeto (ingrediente) que se obtiene al recolectarla. */
  readonly itemId: string;
  readonly biome: string;
  readonly rarity: Rarity;
  readonly properties: readonly { readonly element: AlchemyElement; readonly potency: number }[];
  readonly regenSeconds: number;
  readonly conditions: {
    /** Tiles de suelo (capas ground/detail) donde crece. */
    readonly terrain: readonly string[];
    /** Horas en que puede recolectarse (p. ej. solo de noche). */
    readonly activeHours: HourRange | null;
  };
  /** Plantas con las que combina en alquimia (informativo hasta la Fase 5). */
  readonly compatibilities: readonly string[];
  readonly yield: { readonly min: number; readonly max: number };
  readonly xp: number;
}

export interface PlantCatalog {
  readonly all: ReadonlyMap<string, PlantDefinition>;
  get(id: string): PlantDefinition;
}

export function parsePlantCatalog(raw: unknown, source: string): PlantCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const all = new Map<string, PlantDefinition>();
  const ids = (v: unknown, path: string) =>
    (issues.array(v, path) ?? []).filter(
      (x, j): x is string => issues.string(x, `${path}[${j}]`, { pattern: ID_PATTERN }) !== undefined,
    );
  issues.array(root?.['plants'], '$.plants')?.forEach((entry, i) => {
    const p = `$.plants[${i}]`;
    const r = issues.record(entry, p);
    if (!r) return;
    const before = issues.count;
    const c = issues.record(r['conditions'], `${p}.conditions`) ?? {};
    const y = issues.record(r['yield'], `${p}.yield`) ?? {};
    const properties = (issues.array(r['properties'], `${p}.properties`) ?? []).flatMap((pr, j) => {
      const e = issues.record(pr, `${p}.properties[${j}]`);
      if (!e) return [];
      const element = issues.oneOf(e['element'], ALCHEMY_ELEMENTS, `${p}.properties[${j}].element`);
      const potency = issues.number(e['potency'], `${p}.properties[${j}].potency`, { integer: true, min: 1, max: 5 });
      return element && potency !== undefined ? [{ element, potency }] : [];
    });
    if (properties.length === 0) issues.add(`${p}.properties`, 'necesita al menos una propiedad alquímica');
    const terrain = ids(c['terrain'], `${p}.conditions.terrain`);
    if (terrain.length === 0) issues.add(`${p}.conditions.terrain`, 'necesita al menos un tipo de suelo');
    const min = issues.number(y['min'], `${p}.yield.min`, { integer: true, min: 1, max: 99 });
    const max = issues.number(y['max'], `${p}.yield.max`, { integer: true, min: 1, max: 99 });
    if (min !== undefined && max !== undefined && min > max) issues.add(`${p}.yield`, 'min > max');
    const def = {
      id: issues.string(r['id'], `${p}.id`, { pattern: ID_PATTERN }),
      name: issues.string(r['name'], `${p}.name`),
      itemId: issues.string(r['itemId'], `${p}.itemId`, { pattern: ID_PATTERN }),
      biome: issues.string(r['biome'], `${p}.biome`, { pattern: ID_PATTERN }),
      rarity: issues.oneOf(r['rarity'], RARITIES, `${p}.rarity`),
      properties,
      regenSeconds: issues.number(r['regenSeconds'], `${p}.regenSeconds`, { min: 1, max: 3600 }),
      conditions: { terrain, activeHours: parseHourRange(issues, c['activeHours'], `${p}.conditions.activeHours`) },
      compatibilities: ids(r['compatibilities'] ?? [], `${p}.compatibilities`),
      yield: { min, max },
      xp: issues.number(r['xp'], `${p}.xp`, { integer: true, min: 0, max: 10_000 }),
    };
    if (def.id && all.has(def.id)) issues.add(`${p}.id`, `identificador duplicado "${def.id}"`);
    if (issues.count === before) all.set(def.id as string, def as PlantDefinition);
  });
  issues.throwIfAny(source);
  return {
    all,
    get(id) {
      const d = all.get(id);
      if (!d) throw new Error(`Planta desconocida: "${id}"`);
      return d;
    },
  };
}

export interface PlantNode {
  readonly id: string;
  readonly plantId: string;
  readonly zoneId: string;
  readonly position: Vec2;
  /** Tiempo de simulación en que vuelve a estar madura. */
  readyAt: number;
}

export type HarvestFailure = 'regrowing' | 'out-of-hours';
export type HarvestResult =
  | { readonly ok: true; readonly itemId: string; readonly quantity: number; readonly xp: number }
  | { readonly ok: false; readonly reason: HarvestFailure };

/** ¿Crece esta planta en la celda? Se considera el suelo base y su variación. */
export function plantGrowsAt(def: PlantDefinition, map: WorldMap, x: number, y: number): boolean {
  if (map.isBlocked(x, y) || map.tileAt('paths', x, y) !== null) return false;
  const ground = map.tileAt('ground', x, y);
  const detail = map.tileAt('detail', x, y);
  return (ground !== null && def.conditions.terrain.includes(ground)) || (detail !== null && def.conditions.terrain.includes(detail));
}

/** Plantas recolectables del sector, ubicadas según las zonas de recolección del mapa. */
export class PlantField {
  private readonly nodes = new Map<string, PlantNode>();
  private readonly catalog: PlantCatalog;

  constructor(catalog: PlantCatalog) {
    this.catalog = catalog;
  }

  /** Ubica las plantas de cada zona en celdas que cumplen sus condiciones (determinista). */
  static place(map: WorldMap, zones: readonly GatherZone[], catalog: PlantCatalog, rng: Rng): PlantField {
    const field = new PlantField(catalog);
    for (const zone of zones) {
      const def = catalog.get(zone.plantId);
      const r = Math.ceil(zone.radius);
      const candidates: Vec2[] = [];
      for (let y = Math.floor(zone.center.y) - r; y <= Math.floor(zone.center.y) + r; y++) {
        for (let x = Math.floor(zone.center.x) - r; x <= Math.floor(zone.center.x) + r; x++) {
          if (Math.hypot(x + 0.5 - zone.center.x, y + 0.5 - zone.center.y) > zone.radius) continue;
          if (plantGrowsAt(def, map, x, y)) candidates.push({ x: x + 0.5, y: y + 0.5 });
        }
      }
      for (let n = 0; n < zone.count && candidates.length > 0; n++) {
        const [position] = candidates.splice(Math.floor(rng() * candidates.length), 1);
        if (!position) break;
        const id = `${zone.id}#${n + 1}`;
        field.nodes.set(id, { id, plantId: def.id, zoneId: zone.id, position, readyAt: 0 });
      }
    }
    return field;
  }

  all(): IterableIterator<PlantNode> {
    return this.nodes.values();
  }

  get(id: string): PlantNode | undefined {
    return this.nodes.get(id);
  }

  isReady(node: PlantNode, time: number, hour: number): boolean {
    return time >= node.readyAt && inHourRange(hour, this.catalog.get(node.plantId).conditions.activeHours);
  }

  /**
   * Planta a la que apunta la interacción dentro de `radius`: la madura más cercana; si no hay
   * ninguna madura, la más cercana (para informar al jugador de cuándo volverá a crecer).
   */
  nearest(at: Vec2, radius: number, time = 0, hour = 12): PlantNode | null {
    let best: PlantNode | null = null;
    let bestScore = Infinity;
    for (const n of this.nodes.values()) {
      const d = Math.hypot(n.position.x - at.x, n.position.y - at.y);
      if (d > radius) continue;
      const score = d + (this.isReady(n, time, hour) ? 0 : radius + 1);
      if (score < bestScore) {
        best = n;
        bestScore = score;
      }
    }
    return best;
  }

  harvest(nodeId: string, time: number, hour: number, rng: Rng): HarvestResult {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Planta inexistente: ${nodeId}`);
    const def = this.catalog.get(node.plantId);
    if (time < node.readyAt) return { ok: false, reason: 'regrowing' };
    if (!inHourRange(hour, def.conditions.activeHours)) return { ok: false, reason: 'out-of-hours' };
    node.readyAt = time + def.regenSeconds;
    const quantity = def.yield.min + Math.floor(rng() * (def.yield.max - def.yield.min + 1));
    return { ok: true, itemId: def.itemId, quantity, xp: def.xp };
  }
}
