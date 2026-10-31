import { ID_PATTERN, Issues } from '../data/validate.ts';

/** Estados alterados de GAME_DESIGN §6.3, definidos por datos. */
export const STATUS_KINDS = ['damageOverTime', 'healOverTime', 'speedMultiplier', 'damageTakenMultiplier'] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export interface StatusDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: StatusKind;
  /** Duración base en segundos. La resistencia del objetivo la reduce si el estado es perjudicial. */
  readonly duration: number;
  /**
   * damageOverTime / healOverTime: daño o curación por tick.
   * speedMultiplier / damageTakenMultiplier: factor multiplicativo.
   */
  readonly magnitude: number;
  /** Solo para damageOverTime y healOverTime. */
  readonly tickInterval: number;
  readonly harmful: boolean;
}

export interface StatusCatalog {
  readonly all: ReadonlyMap<string, StatusDefinition>;
  get(id: string): StatusDefinition;
}

export function parseStatusCatalog(raw: unknown, source: string): StatusCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const all = new Map<string, StatusDefinition>();
  issues.array(root?.['statuses'], '$.statuses')?.forEach((entry, i) => {
    const p = `$.statuses[${i}]`;
    const s = issues.record(entry, p);
    if (!s) return;
    const before = issues.count;
    const kind = issues.oneOf(s['kind'], STATUS_KINDS, `${p}.kind`);
    const def = {
      id: issues.string(s['id'], `${p}.id`, { pattern: ID_PATTERN }),
      name: issues.string(s['name'], `${p}.name`),
      kind,
      duration: issues.number(s['duration'], `${p}.duration`, { min: 0.1, max: 600 }),
      magnitude: issues.number(s['magnitude'], `${p}.magnitude`, { min: 0 }),
      tickInterval:
        kind === 'damageOverTime' || kind === 'healOverTime'
          ? issues.number(s['tickInterval'], `${p}.tickInterval`, { min: 0.05, max: 60 })
          : 0,
      harmful: issues.boolean(s['harmful'], `${p}.harmful`),
    };
    if (def.id && all.has(def.id)) issues.add(`${p}.id`, `identificador duplicado "${def.id}"`);
    if (issues.count === before) all.set(def.id as string, def as StatusDefinition);
  });
  issues.throwIfAny(source);
  return {
    all,
    get(id) {
      const d = all.get(id);
      if (!d) throw new Error(`Estado desconocido: "${id}"`);
      return d;
    },
  };
}

/** Instancia activa de un estado sobre un combatiente. */
export interface ActiveStatus {
  readonly def: StatusDefinition;
  remaining: number;
  untilTick: number;
  readonly sourceId: string;
}

/** Duración efectiva: la resistencia reduce los estados perjudiciales con rendimiento decreciente. */
export function effectiveDuration(def: StatusDefinition, resistance: number): number {
  return def.harmful ? (def.duration * 100) / (100 + resistance) : def.duration;
}
