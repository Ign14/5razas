import type { Issues } from '../data/validate.ts';

/** Atributos de GAME_DESIGN §4.2. */
export const STAT_KEYS = [
  'life',
  'energy',
  'attack',
  'power',
  'defense',
  'resistance',
  'speed',
  'attackRate',
  'crit',
  'evasion',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Readonly<Record<StatKey, number>>;

/** Límites de validación por atributo. crit y evasion son probabilidades. */
const STAT_LIMITS: Readonly<Record<StatKey, { min: number; max: number }>> = {
  life: { min: 1, max: 1_000_000 },
  energy: { min: 0, max: 100_000 },
  attack: { min: 0, max: 100_000 },
  power: { min: 0, max: 100_000 },
  defense: { min: 0, max: 100_000 },
  resistance: { min: 0, max: 100_000 },
  speed: { min: 0, max: 20 },
  attackRate: { min: 0.1, max: 10 },
  crit: { min: 0, max: 0.95 },
  evasion: { min: 0, max: 0.95 },
};

/** Modificador de atributo (equipo, alquimia, estados). Se aplican primero los "add" y luego los "mul". */
export interface StatModifier {
  readonly stat: StatKey;
  readonly op: 'add' | 'mul';
  readonly value: number;
  readonly source: string;
}

export function applyModifiers(base: Stats, mods: readonly StatModifier[]): Stats {
  const out = { ...base };
  for (const m of mods) if (m.op === 'add') out[m.stat] += m.value;
  for (const m of mods) if (m.op === 'mul') out[m.stat] *= m.value;
  for (const key of STAT_KEYS) {
    out[key] = Math.min(STAT_LIMITS[key].max, Math.max(key === 'life' ? 1 : 0, out[key]));
  }
  return out;
}

export function parseStats(issues: Issues, raw: unknown, path: string): Stats | undefined {
  const r = issues.record(raw, path);
  if (!r) return undefined;
  const out: Partial<Record<StatKey, number>> = {};
  let ok = true;
  for (const key of STAT_KEYS) {
    const v = issues.number(r[key], `${path}.${key}`, STAT_LIMITS[key]);
    if (v === undefined) ok = false;
    else out[key] = v;
  }
  return ok ? (out as Stats) : undefined;
}
