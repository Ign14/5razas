import { ID_PATTERN, Issues } from '../data/validate.ts';
import type { Rng } from '../math/random.ts';

export interface LootEntry {
  readonly itemId: string;
  /** Probabilidad independiente de soltar esta entrada (0..1). */
  readonly chance: number;
  readonly min: number;
  readonly max: number;
}

export interface LootTable {
  readonly id: string;
  readonly entries: readonly LootEntry[];
}

export interface LootTableCatalog {
  readonly all: ReadonlyMap<string, LootTable>;
  get(id: string): LootTable;
}

export function parseLootTables(raw: unknown, source: string): LootTableCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const all = new Map<string, LootTable>();
  issues.array(root?.['lootTables'], '$.lootTables')?.forEach((entry, i) => {
    const p = `$.lootTables[${i}]`;
    const t = issues.record(entry, p);
    if (!t) return;
    const before = issues.count;
    const id = issues.string(t['id'], `${p}.id`, { pattern: ID_PATTERN });
    const entries = (issues.array(t['entries'], `${p}.entries`) ?? []).flatMap((e, j) => {
      const ep = `${p}.entries[${j}]`;
      const r = issues.record(e, ep);
      if (!r) return [];
      const itemId = issues.string(r['itemId'], `${ep}.itemId`, { pattern: ID_PATTERN });
      const chance = issues.number(r['chance'], `${ep}.chance`, { min: 0, max: 1 });
      const min = issues.number(r['min'], `${ep}.min`, { integer: true, min: 1, max: 999 });
      const max = issues.number(r['max'], `${ep}.max`, { integer: true, min: 1, max: 999 });
      if (min !== undefined && max !== undefined && min > max) issues.add(ep, 'min > max');
      return itemId && chance !== undefined && min !== undefined && max !== undefined ? [{ itemId, chance, min, max }] : [];
    });
    if (id && all.has(id)) issues.add(`${p}.id`, `identificador duplicado "${id}"`);
    if (issues.count === before && id) all.set(id, { id, entries });
  });
  issues.throwIfAny(source);
  return {
    all,
    get(id) {
      const t = all.get(id);
      if (!t) throw new Error(`Tabla de botín desconocida: "${id}"`);
      return t;
    },
  };
}

/** Tira la tabla: cada entrada se evalúa de forma independiente y en orden (determinista). */
export function rollLoot(table: LootTable, rng: Rng): { itemId: string; quantity: number }[] {
  const drops: { itemId: string; quantity: number }[] = [];
  for (const e of table.entries) {
    if (rng() >= e.chance) continue;
    drops.push({ itemId: e.itemId, quantity: e.min + Math.floor(rng() * (e.max - e.min + 1)) });
  }
  return drops;
}
