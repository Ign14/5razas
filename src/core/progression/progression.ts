import { STAT_KEYS, type StatKey, type Stats } from '../combat/stats.ts';
import { ID_PATTERN, Issues } from '../data/validate.ts';

/** Etapa de progresión (GAME_DESIGN §7). */
export interface Stage {
  readonly id: string;
  readonly name: string;
  readonly minLevel: number;
}

/**
 * Configuración de progresión. XP necesaria para pasar del nivel L al L+1:
 *   round(base + factor × (L − 1)^exponent)
 * Ajustable por datos sin tocar código de combate.
 */
export interface ProgressionConfig {
  readonly maxLevel: number;
  readonly curve: { readonly base: number; readonly factor: number; readonly exponent: number };
  readonly stages: readonly Stage[];
  /** XP de una criatura = xpReward × (1 + creatureXpPerLevel × (nivel − 1)). */
  readonly creatureXpPerLevel: number;
  readonly fullHealOnLevelUp: boolean;
}

export type StatGrowth = Readonly<Record<StatKey, number>>;

export function parseProgression(raw: unknown, source: string): ProgressionConfig {
  const issues = new Issues();
  const r = issues.record(raw, '$') ?? {};
  const c = issues.record(r['curve'], '$.curve') ?? {};
  const maxLevel = issues.number(r['maxLevel'], '$.maxLevel', { integer: true, min: 2, max: 1000 });
  const stages = (issues.array(r['stages'], '$.stages') ?? []).flatMap((s, i) => {
    const p = `$.stages[${i}]`;
    const st = issues.record(s, p);
    if (!st) return [];
    const id = issues.string(st['id'], `${p}.id`, { pattern: ID_PATTERN });
    const name = issues.string(st['name'], `${p}.name`);
    const minLevel = issues.number(st['minLevel'], `${p}.minLevel`, { integer: true, min: 1, max: maxLevel ?? 1000 });
    return id && name && minLevel !== undefined ? [{ id, name, minLevel }] : [];
  });
  if (stages[0]?.minLevel !== 1) issues.add('$.stages', 'la primera etapa debe empezar en el nivel 1');
  for (let i = 1; i < stages.length; i++) {
    if ((stages[i]?.minLevel ?? 0) <= (stages[i - 1]?.minLevel ?? 0)) issues.add(`$.stages[${i}]`, 'las etapas deben estar en orden creciente');
  }
  const cfg = {
    maxLevel,
    curve: {
      base: issues.number(c['base'], '$.curve.base', { min: 1 }),
      factor: issues.number(c['factor'], '$.curve.factor', { min: 0 }),
      exponent: issues.number(c['exponent'], '$.curve.exponent', { min: 0, max: 5 }),
    },
    stages,
    creatureXpPerLevel: issues.number(r['creatureXpPerLevel'], '$.creatureXpPerLevel', { min: 0, max: 10 }),
    fullHealOnLevelUp: issues.boolean(r['fullHealOnLevelUp'], '$.fullHealOnLevelUp'),
  };
  issues.throwIfAny(source);
  return cfg as ProgressionConfig;
}

export function parseStatGrowth(issues: Issues, raw: unknown, path: string): StatGrowth {
  const r = issues.record(raw, path) ?? {};
  const out = {} as Record<StatKey, number>;
  for (const key of STAT_KEYS) {
    out[key] = r[key] === undefined ? 0 : (issues.number(r[key], `${path}.${key}`, { min: 0, max: 10_000 }) ?? 0);
  }
  return out;
}

export function xpToNext(cfg: ProgressionConfig, level: number): number {
  if (level >= cfg.maxLevel) return Infinity;
  const { base, factor, exponent } = cfg.curve;
  return Math.round(base + factor * Math.pow(level - 1, exponent));
}

/** XP total acumulada necesaria para alcanzar `level`. */
export function totalXpForLevel(cfg: ProgressionConfig, level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, cfg.maxLevel); l++) total += xpToNext(cfg, l);
  return total;
}

export function levelForTotalXp(cfg: ProgressionConfig, totalXp: number): number {
  let level = 1;
  let acc = 0;
  while (level < cfg.maxLevel) {
    acc += xpToNext(cfg, level);
    if (totalXp < acc) break;
    level++;
  }
  return level;
}

export function stageFor(cfg: ProgressionConfig, level: number): Stage {
  let current = cfg.stages[0] as Stage;
  for (const s of cfg.stages) if (level >= s.minLevel) current = s;
  return current;
}

/** Atributos en un nivel: base + crecimiento × (nivel − 1). */
export function statsAtLevel(base: Stats, growth: StatGrowth, level: number): Stats {
  const out = { ...base };
  for (const key of STAT_KEYS) out[key] = base[key] + growth[key] * (level - 1);
  return out;
}

export function creatureXp(cfg: ProgressionConfig, xpReward: number, creatureLevel: number): number {
  return Math.round(xpReward * (1 + cfg.creatureXpPerLevel * (creatureLevel - 1)));
}
