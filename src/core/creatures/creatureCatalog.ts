import { parseStats, type Stats } from '../combat/stats.ts';
import { ID_PATTERN, Issues } from '../data/validate.ts';
import { parseStatGrowth, type StatGrowth } from '../progression/progression.ts';

/** Categorías de GAME_DESIGN §9. */
export const CREATURE_CATEGORIES = ['fauna', 'common', 'special', 'boss', 'legendary'] as const;
export type CreatureCategory = (typeof CREATURE_CATEGORIES)[number];

/** Comportamientos implementados. Fauna huidiza/neutral llegará en la Fase 4. */
export const BEHAVIOR_TYPES = ['aggressive'] as const;

export interface CreatureBehavior {
  readonly type: (typeof BEHAVIOR_TYPES)[number];
  /** Distancia a la que detecta al jugador. */
  readonly aggroRadius: number;
  /** Distancia máxima desde su hogar antes de abandonar la persecución. */
  readonly leashRadius: number;
  /** Distancia a la que intenta atacar. */
  readonly attackRange: number;
  /** Radio de deambulación alrededor de su hogar. */
  readonly wanderRadius: number;
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
  readonly spawnRules: { readonly respawnSeconds: number };
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
    if (abilities.length === 0) issues.add(`${p}.abilities`, 'necesita al menos una habilidad');
    const def = {
      id: issues.string(c['id'], `${p}.id`, { pattern: ID_PATTERN }),
      name: issues.string(c['name'], `${p}.name`),
      category: issues.oneOf(c['category'], CREATURE_CATEGORIES, `${p}.category`),
      biome: issues.string(c['biome'], `${p}.biome`, { pattern: ID_PATTERN }),
      levelRange: [lmin, lmax] as [number, number],
      stats: parseStats(issues, c['stats'], `${p}.stats`),
      statsPerLevel: parseStatGrowth(issues, c['statsPerLevel'], `${p}.statsPerLevel`),
      behavior: {
        type: issues.oneOf(b['type'], BEHAVIOR_TYPES, `${p}.behavior.type`),
        aggroRadius: issues.number(b['aggroRadius'], `${p}.behavior.aggroRadius`, { min: 0, max: 64 }),
        leashRadius: issues.number(b['leashRadius'], `${p}.behavior.leashRadius`, { min: 0, max: 128 }),
        attackRange: issues.number(b['attackRange'], `${p}.behavior.attackRange`, { min: 0.1, max: 32 }),
        wanderRadius: issues.number(b['wanderRadius'], `${p}.behavior.wanderRadius`, { min: 0, max: 32 }),
      },
      abilities,
      lootTable: issues.string(c['lootTable'], `${p}.lootTable`, { pattern: ID_PATTERN }),
      xpReward: issues.number(c['xpReward'], `${p}.xpReward`, { integer: true, min: 0 }),
      spriteAtlas: issues.string(c['spriteAtlas'], `${p}.spriteAtlas`),
      hurtboxRadius: issues.number(c['hurtboxRadius'], `${p}.hurtboxRadius`, { min: 0.05, max: 4 }),
      colliderHalfSize: issues.number(c['colliderHalfSize'], `${p}.colliderHalfSize`, { min: 0.05, max: 0.49 }),
      poise: issues.number(c['poise'], `${p}.poise`, { min: 0, max: 100 }),
      spawnRules: { respawnSeconds: issues.number(sr['respawnSeconds'], `${p}.spawnRules.respawnSeconds`, { min: 0 }) },
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
