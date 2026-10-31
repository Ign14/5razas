import type { StatModifier } from '../combat/stats.ts';
import { ID_PATTERN, Issues } from '../data/validate.ts';
import { parseModifiers } from './itemCatalog.ts';

/** Conjunto de equipamiento con bonificaciones por número de piezas (GAME_DESIGN §11). */
export interface EquipmentSetDefinition {
  readonly id: string;
  readonly name: string;
  /** Número romano del set (I..VIII). */
  readonly tier: number;
  readonly minLevel: number;
  readonly pieces: readonly string[];
  readonly bonuses: readonly { readonly pieces: number; readonly modifiers: readonly StatModifier[] }[];
}

export interface EquipmentSetCatalog {
  readonly all: ReadonlyMap<string, EquipmentSetDefinition>;
  get(id: string): EquipmentSetDefinition;
}

export function parseEquipmentSets(raw: unknown, source: string): EquipmentSetCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const all = new Map<string, EquipmentSetDefinition>();
  issues.array(root?.['sets'], '$.sets')?.forEach((entry, i) => {
    const p = `$.sets[${i}]`;
    const s = issues.record(entry, p);
    if (!s) return;
    const before = issues.count;
    const id = issues.string(s['id'], `${p}.id`, { pattern: ID_PATTERN });
    const pieces = (issues.array(s['pieces'], `${p}.pieces`) ?? []).filter(
      (x, j): x is string => issues.string(x, `${p}.pieces[${j}]`, { pattern: ID_PATTERN }) !== undefined,
    );
    if (pieces.length < 2) issues.add(`${p}.pieces`, 'un conjunto necesita al menos 2 piezas');
    const bonuses = (issues.array(s['bonuses'], `${p}.bonuses`) ?? []).flatMap((b, j) => {
      const r = issues.record(b, `${p}.bonuses[${j}]`);
      if (!r) return [];
      const n = issues.number(r['pieces'], `${p}.bonuses[${j}].pieces`, { integer: true, min: 2, max: pieces.length || 2 });
      const modifiers = parseModifiers(issues, r['modifiers'], `${p}.bonuses[${j}].modifiers`, `set:${id ?? '?'}:${n ?? 0}`);
      return n === undefined ? [] : [{ pieces: n, modifiers }];
    });
    const def = {
      id,
      name: issues.string(s['name'], `${p}.name`),
      tier: issues.number(s['tier'], `${p}.tier`, { integer: true, min: 1, max: 8 }),
      minLevel: issues.number(s['minLevel'], `${p}.minLevel`, { integer: true, min: 1, max: 100 }),
      pieces,
      bonuses: bonuses.sort((a, b) => a.pieces - b.pieces),
    };
    if (id && all.has(id)) issues.add(`${p}.id`, `identificador duplicado "${id}"`);
    if (issues.count === before) all.set(id as string, def as EquipmentSetDefinition);
  });
  issues.throwIfAny(source);
  return {
    all,
    get(id) {
      const d = all.get(id);
      if (!d) throw new Error(`Conjunto desconocido: "${id}"`);
      return d;
    },
  };
}
