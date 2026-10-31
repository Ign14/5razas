import { ID_PATTERN, Issues, type Json } from '../data/validate.ts';

/** Forma del área de impacto, en unidades de celda, relativa al lanzador y su dirección de apuntado. */
export type AbilityArea =
  | { readonly shape: 'none' }
  | { readonly shape: 'arc'; readonly radius: number; readonly angleDeg: number }
  | { readonly shape: 'circle'; readonly radius: number }
  /** Línea desde el lanzador; si la habilidad tiene dash, su longitud es el recorrido real. */
  | { readonly shape: 'line'; readonly length: number; readonly width: number };

export const DAMAGE_TYPES = ['physical', 'power'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** basic escala su recuperación con el atributo Cadencia. */
export const ABILITY_CATEGORIES = ['basic', 'skill', 'final', 'movement'] as const;
export type AbilityCategory = (typeof ABILITY_CATEGORIES)[number];

export interface AbilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: AbilityCategory;
  readonly damageType: DamageType;
  readonly multiplier: number;
  /** Distancia del centro del área respecto del lanzador (solo circle). */
  readonly range: number;
  readonly area: AbilityArea;
  readonly energyCost: number;
  readonly cooldown: number;
  /** Tiempo entre la activación y el primer impacto (telegrafía). */
  readonly windup: number;
  readonly hits: number;
  readonly hitInterval: number;
  /** Distancia de retroceso aplicada al objetivo, en celdas. */
  readonly knockback: number;
  readonly dash: { readonly distance: number; readonly duration: number; readonly invulnerable: boolean } | null;
  readonly applyStatus: { readonly statusId: string; readonly target: 'self' | 'hit'; readonly chance: number } | null;
  readonly animation: string;
  readonly vfx: string;
  readonly unlockLevel: number;
  /** Modificadores compatibles (p. ej. "element" para la alquimia de la Fase 5). */
  readonly compatibleModifiers: readonly string[];
}

export interface AbilityCatalog {
  readonly all: ReadonlyMap<string, AbilityDefinition>;
  get(id: string): AbilityDefinition;
}

function parseArea(issues: Issues, raw: unknown, p: string): AbilityArea | undefined {
  const a = issues.record(raw, p);
  if (!a) return undefined;
  const shape = issues.oneOf(a['shape'], ['none', 'arc', 'circle', 'line'] as const, `${p}.shape`);
  const num = (k: string, opts: { min?: number; max?: number } = { min: 0.05, max: 32 }) =>
    issues.number(a[k], `${p}.${k}`, opts);
  switch (shape) {
    case 'none':
      return { shape };
    case 'arc': {
      const radius = num('radius');
      const angleDeg = num('angleDeg', { min: 1, max: 360 });
      return radius !== undefined && angleDeg !== undefined ? { shape, radius, angleDeg } : undefined;
    }
    case 'circle': {
      const radius = num('radius');
      return radius !== undefined ? { shape, radius } : undefined;
    }
    case 'line': {
      const length = num('length');
      const width = num('width');
      return length !== undefined && width !== undefined ? { shape, length, width } : undefined;
    }
    default:
      return undefined;
  }
}

function parseAbility(issues: Issues, s: Json, p: string): AbilityDefinition | undefined {
  const before = issues.count;
  const dashRaw = s['dash'];
  let dash: AbilityDefinition['dash'] = null;
  if (dashRaw !== null && dashRaw !== undefined) {
    const d = issues.record(dashRaw, `${p}.dash`);
    if (d) {
      dash = {
        distance: issues.number(d['distance'], `${p}.dash.distance`, { min: 0.1, max: 16 }) ?? 0,
        duration: issues.number(d['duration'], `${p}.dash.duration`, { min: 0.05, max: 2 }) ?? 0,
        invulnerable: issues.boolean(d['invulnerable'], `${p}.dash.invulnerable`) ?? false,
      };
    }
  }
  const statusRaw = s['applyStatus'];
  let applyStatus: AbilityDefinition['applyStatus'] = null;
  if (statusRaw !== null && statusRaw !== undefined) {
    const st = issues.record(statusRaw, `${p}.applyStatus`);
    if (st) {
      applyStatus = {
        statusId: issues.string(st['statusId'], `${p}.applyStatus.statusId`, { pattern: ID_PATTERN }) ?? '',
        target: issues.oneOf(st['target'], ['self', 'hit'] as const, `${p}.applyStatus.target`) ?? 'hit',
        chance: issues.number(st['chance'], `${p}.applyStatus.chance`, { min: 0, max: 1 }) ?? 0,
      };
    }
  }
  const def = {
    id: issues.string(s['id'], `${p}.id`, { pattern: ID_PATTERN }),
    name: issues.string(s['name'], `${p}.name`),
    description: issues.string(s['description'], `${p}.description`),
    category: issues.oneOf(s['category'], ABILITY_CATEGORIES, `${p}.category`),
    damageType: issues.oneOf(s['damageType'], DAMAGE_TYPES, `${p}.damageType`),
    multiplier: issues.number(s['multiplier'], `${p}.multiplier`, { min: 0, max: 100 }),
    range: issues.number(s['range'], `${p}.range`, { min: 0, max: 32 }),
    area: parseArea(issues, s['area'], `${p}.area`),
    energyCost: issues.number(s['energyCost'], `${p}.energyCost`, { min: 0 }),
    cooldown: issues.number(s['cooldown'], `${p}.cooldown`, { min: 0, max: 600 }),
    windup: issues.number(s['windup'], `${p}.windup`, { min: 0, max: 10 }),
    hits: issues.number(s['hits'], `${p}.hits`, { integer: true, min: 0, max: 50 }),
    hitInterval: issues.number(s['hitInterval'], `${p}.hitInterval`, { min: 0, max: 10 }),
    knockback: issues.number(s['knockback'], `${p}.knockback`, { min: 0, max: 16 }),
    dash,
    applyStatus,
    animation: issues.string(s['animation'], `${p}.animation`),
    vfx: issues.string(s['vfx'], `${p}.vfx`),
    unlockLevel: issues.number(s['unlockLevel'], `${p}.unlockLevel`, { integer: true, min: 1, max: 100 }),
    compatibleModifiers: (issues.array(s['compatibleModifiers'], `${p}.compatibleModifiers`) ?? []).filter(
      (m, j): m is string => issues.string(m, `${p}.compatibleModifiers[${j}]`) !== undefined,
    ),
  };
  if (def.hits !== undefined && def.hits > 0 && def.area?.shape === 'none')
    issues.add(`${p}.area`, 'una habilidad con impactos necesita un área');
  return issues.count === before ? (def as AbilityDefinition) : undefined;
}

export function parseAbilityCatalog(raw: unknown, source: string): AbilityCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const all = new Map<string, AbilityDefinition>();
  issues.array(root?.['abilities'], '$.abilities')?.forEach((entry, i) => {
    const p = `$.abilities[${i}]`;
    const s = issues.record(entry, p);
    if (!s) return;
    const def = parseAbility(issues, s, p);
    if (!def) return;
    if (all.has(def.id)) issues.add(`${p}.id`, `identificador duplicado "${def.id}"`);
    all.set(def.id, def);
  });
  issues.throwIfAny(source);
  return {
    all,
    get(id) {
      const d = all.get(id);
      if (!d) throw new Error(`Habilidad desconocida: "${id}"`);
      return d;
    },
  };
}
