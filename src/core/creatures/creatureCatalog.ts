import { parseStats, type Stats } from '../combat/stats.ts';
import { ID_PATTERN, Issues, type Json } from '../data/validate.ts';
import { parseStatGrowth, type StatGrowth } from '../progression/progression.ts';
import { parseHourRange, type HourRange } from '../world/worldClock.ts';

/** Categorías de GAME_DESIGN §9. */
export const CREATURE_CATEGORIES = ['fauna', 'common', 'special', 'boss', 'legendary'] as const;
export type CreatureCategory = (typeof CREATURE_CATEGORIES)[number];

/** Comportamientos (GAME_DESIGN §8: no todos los animales son hostiles). */
export const BEHAVIOR_TYPES = ['aggressive', 'territorial', 'neutral', 'fleeing'] as const;
export type BehaviorType = (typeof BEHAVIOR_TYPES)[number];

interface BehaviorBase {
  /** Radio de deambulación alrededor de su hogar. */
  readonly wanderRadius: number;
}

interface CombatBehaviorBase extends BehaviorBase {
  /** Distancia máxima desde su hogar antes de abandonar la persecución. */
  readonly leashRadius: number;
  /** Distancia a la que intenta atacar. */
  readonly attackRange: number;
}

/** Persigue al jugador en cuanto lo detecta. */
export interface AggressiveBehavior extends CombatBehaviorBase {
  readonly type: 'aggressive';
  readonly aggroRadius: number;
}

/** Solo ataca si el jugador entra en su territorio (radio alrededor de su hogar). */
export interface TerritorialBehavior extends CombatBehaviorBase {
  readonly type: 'territorial';
  readonly territoryRadius: number;
}

/** Ignora al jugador hasta recibir daño; entonces responde durante un tiempo. */
export interface NeutralBehavior extends CombatBehaviorBase {
  readonly type: 'neutral';
  readonly retaliateSeconds: number;
}

/** Se pone alerta al detectar al jugador y huye si se acerca demasiado o recibe daño. */
export interface FleeingBehavior extends BehaviorBase {
  readonly type: 'fleeing';
  readonly alertRadius: number;
  readonly fleeRadius: number;
  /** Segundos que corre antes de volver a calmarse. */
  readonly fleeSeconds: number;
}

export type CreatureBehavior = AggressiveBehavior | TerritorialBehavior | NeutralBehavior | FleeingBehavior;

/** Radio en el que la criatura puede llegar a atacar al jugador sin haber sido provocada. */
export function threatRadius(b: CreatureBehavior): number {
  switch (b.type) {
    case 'aggressive':
      return b.aggroRadius;
    case 'territorial':
      return b.territoryRadius;
    default:
      return 0;
  }
}

function parseBehavior(issues: Issues, b: Json, p: string): CreatureBehavior | undefined {
  const type = issues.oneOf(b['type'], BEHAVIOR_TYPES, `${p}.type`);
  const num = (k: string, min: number, max: number) => issues.number(b[k], `${p}.${k}`, { min, max }) ?? 0;
  const wanderRadius = num('wanderRadius', 0, 32);
  switch (type) {
    case 'aggressive':
      return { type, wanderRadius, leashRadius: num('leashRadius', 0, 128), attackRange: num('attackRange', 0.1, 32), aggroRadius: num('aggroRadius', 0, 64) };
    case 'territorial':
      return { type, wanderRadius, leashRadius: num('leashRadius', 0, 128), attackRange: num('attackRange', 0.1, 32), territoryRadius: num('territoryRadius', 0.5, 64) };
    case 'neutral':
      return { type, wanderRadius, leashRadius: num('leashRadius', 0, 128), attackRange: num('attackRange', 0.1, 32), retaliateSeconds: num('retaliateSeconds', 1, 120) };
    case 'fleeing': {
      const alertRadius = num('alertRadius', 0.5, 64);
      const fleeRadius = num('fleeRadius', 0.5, 64);
      if (fleeRadius > alertRadius) issues.add(`${p}.fleeRadius`, 'debe ser ≤ alertRadius');
      return { type, wanderRadius, alertRadius, fleeRadius, fleeSeconds: num('fleeSeconds', 0.5, 60) };
    }
    default:
      return undefined;
  }
}

export interface CreatureDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: CreatureCategory;
  readonly biome: string;
  readonly levelRange: readonly [number, number];
  readonly stats: Stats;
  /** Incremento por nivel dentro de levelRange. */
  readonly statsPerLevel: StatGrowth;
  readonly behavior: CreatureBehavior;
  readonly abilities: readonly string[];
  /** Referencia a una tabla de botín (se resuelve en la Fase 3). */
  readonly lootTable: string;
  readonly xpReward: number;
  readonly spriteAtlas: string;
  readonly hurtboxRadius: number;
  readonly colliderHalfSize: number;
  /** Ver Combatant.poise. */
  readonly poise: number;
  /** Tiles de suelo (capas ground/detail) donde puede aparecer; vacío = cualquiera transitable. */
  readonly habitat: readonly string[];
  readonly spawnRules: {
    readonly respawnSeconds: number;
    /** Horas en que aparece; fuera de ellas no reaparece y desaparece lejos del jugador. */
    readonly activeHours: HourRange | null;
  };
}

export interface CreatureCatalog {
  readonly all: ReadonlyMap<string, CreatureDefinition>;
  get(id: string): CreatureDefinition;
}

export function parseCreatureCatalog(raw: unknown, source: string): CreatureCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const all = new Map<string, CreatureDefinition>();
  issues.array(root?.['creatures'], '$.creatures')?.forEach((entry, i) => {
    const p = `$.creatures[${i}]`;
    const c = issues.record(entry, p);
    if (!c) return;
    const before = issues.count;
    const lr = issues.array(c['levelRange'], `${p}.levelRange`);
    const lmin = issues.number(lr?.[0], `${p}.levelRange[0]`, { integer: true, min: 1, max: 100 });
    const lmax = issues.number(lr?.[1], `${p}.levelRange[1]`, { integer: true, min: 1, max: 100 });
    if (lmin !== undefined && lmax !== undefined && lmin > lmax) issues.add(`${p}.levelRange`, 'mínimo > máximo');
    const b = issues.record(c['behavior'], `${p}.behavior`) ?? {};
    const sr = issues.record(c['spawnRules'], `${p}.spawnRules`) ?? {};
    const abilities = (issues.array(c['abilities'], `${p}.abilities`) ?? []).filter(
      (a, j): a is string => issues.string(a, `${p}.abilities[${j}]`, { pattern: ID_PATTERN }) !== undefined,
    );
    const behavior = parseBehavior(issues, b, `${p}.behavior`);
    if (abilities.length === 0 && behavior && behavior.type !== 'fleeing')
      issues.add(`${p}.abilities`, 'las criaturas que combaten necesitan al menos una habilidad');
    const def = {
      id: issues.string(c['id'], `${p}.id`, { pattern: ID_PATTERN }),
      name: issues.string(c['name'], `${p}.name`),
      category: issues.oneOf(c['category'], CREATURE_CATEGORIES, `${p}.category`),
      biome: issues.string(c['biome'], `${p}.biome`, { pattern: ID_PATTERN }),
      levelRange: [lmin, lmax] as [number, number],
      stats: parseStats(issues, c['stats'], `${p}.stats`),
      statsPerLevel: parseStatGrowth(issues, c['statsPerLevel'], `${p}.statsPerLevel`),
      behavior,
      abilities,
      lootTable: issues.string(c['lootTable'], `${p}.lootTable`, { pattern: ID_PATTERN }),
      xpReward: issues.number(c['xpReward'], `${p}.xpReward`, { integer: true, min: 0 }),
      spriteAtlas: issues.string(c['spriteAtlas'], `${p}.spriteAtlas`),
      hurtboxRadius: issues.number(c['hurtboxRadius'], `${p}.hurtboxRadius`, { min: 0.05, max: 4 }),
      colliderHalfSize: issues.number(c['colliderHalfSize'], `${p}.colliderHalfSize`, { min: 0.05, max: 0.49 }),
      poise: issues.number(c['poise'], `${p}.poise`, { min: 0, max: 100 }),
      habitat: (issues.array(c['habitat'] ?? [], `${p}.habitat`) ?? []).filter(
        (t, j): t is string => issues.string(t, `${p}.habitat[${j}]`, { pattern: ID_PATTERN }) !== undefined,
      ),
      spawnRules: {
        respawnSeconds: issues.number(sr['respawnSeconds'], `${p}.spawnRules.respawnSeconds`, { min: 0 }),
        activeHours: parseHourRange(issues, sr['activeHours'], `${p}.spawnRules.activeHours`),
      },
    };
    if (def.id && all.has(def.id)) issues.add(`${p}.id`, `identificador duplicado "${def.id}"`);
    if (issues.count === before) all.set(def.id as string, def as CreatureDefinition);
  });
  issues.throwIfAny(source);
  return {
    all,
    get(id) {
      const d = all.get(id);
      if (!d) throw new Error(`Criatura desconocida: "${id}"`);
      return d;
    },
  };
}
