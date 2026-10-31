import { parseStats, type Stats } from '../combat/stats.ts';
import { ID_PATTERN, Issues } from '../data/validate.ts';
import { parseStatGrowth, type StatGrowth } from '../progression/progression.ts';

/** Ranuras de acción de GAME_DESIGN §6.1 más la evasión (Espacio). */
export const ACTION_SLOTS = ['basic', 'power1', 'power2', 'power3', 'final', 'dodge'] as const;
export type ActionSlot = (typeof ACTION_SLOTS)[number];

export interface ProfessionDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly baseStats: Stats;
  /** Incremento de atributos por cada nivel (GAME_DESIGN §7). */
  readonly statsPerLevel: StatGrowth;
  readonly energyRegen: number;
  readonly invulnerabilityOnHit: number;
  readonly hurtboxRadius: number;
  readonly abilities: Readonly<Record<ActionSlot, string>>;
}

export function parseProfession(raw: unknown, source: string): ProfessionDefinition {
  const issues = new Issues();
  const r = issues.record(raw, '$') ?? {};
  const slots = issues.record(r['abilities'], '$.abilities') ?? {};
  const abilities: Partial<Record<ActionSlot, string>> = {};
  for (const slot of ACTION_SLOTS) {
    const id = issues.string(slots[slot], `$.abilities.${slot}`, { pattern: ID_PATTERN });
    if (id) abilities[slot] = id;
  }
  const def = {
    id: issues.string(r['id'], '$.id', { pattern: ID_PATTERN }),
    name: issues.string(r['name'], '$.name'),
    description: issues.string(r['description'], '$.description'),
    baseStats: parseStats(issues, r['baseStats'], '$.baseStats'),
    statsPerLevel: parseStatGrowth(issues, r['statsPerLevel'], '$.statsPerLevel'),
    energyRegen: issues.number(r['energyRegen'], '$.energyRegen', { min: 0, max: 1000 }),
    invulnerabilityOnHit: issues.number(r['invulnerabilityOnHit'], '$.invulnerabilityOnHit', { min: 0, max: 5 }),
    hurtboxRadius: issues.number(r['hurtboxRadius'], '$.hurtboxRadius', { min: 0.05, max: 2 }),
    abilities,
  };
  issues.throwIfAny(source);
  return def as ProfessionDefinition;
}
