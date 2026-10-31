import { ID_PATTERN, Issues } from '../data/validate.ts';

/**
 * Tipos de objetivo:
 * - defeat: derrotar criaturas (`target` = id de criatura).
 * - gather: recolectar plantas (`target` = id de planta; cuenta unidades obtenidas).
 * - discover: descubrir recetas de alquimia (`target` = id de receta, o null para cualquiera).
 * - collect: tener objetos en el inventario (`target` = id de objeto; se revisa en cada cambio).
 */
export const OBJECTIVE_TYPES = ['defeat', 'gather', 'discover', 'collect'] as const;
export type ObjectiveType = (typeof OBJECTIVE_TYPES)[number];

export interface QuestObjective {
  readonly id: string;
  readonly type: ObjectiveType;
  readonly target: string | null;
  readonly count: number;
  readonly description: string;
}

export interface QuestDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** PNJ que la entrega y la recibe. */
  readonly giver: string;
  readonly prerequisites: readonly string[];
  readonly objectives: readonly QuestObjective[];
  readonly rewards: { readonly xp: number; readonly items: readonly { readonly itemId: string; readonly quantity: number }[] };
}

export interface QuestCatalog {
  readonly all: ReadonlyMap<string, QuestDefinition>;
  get(id: string): QuestDefinition;
}

export function parseQuestCatalog(raw: unknown, source: string): QuestCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const all = new Map<string, QuestDefinition>();
  issues.array(root?.['quests'], '$.quests')?.forEach((entry, i) => {
    const p = `$.quests[${i}]`;
    const q = issues.record(entry, p);
    if (!q) return;
    const before = issues.count;
    const objectives = (issues.array(q['objectives'], `${p}.objectives`) ?? []).flatMap((o, j): QuestObjective[] => {
      const op = `${p}.objectives[${j}]`;
      const r = issues.record(o, op);
      if (!r) return [];
      const type = issues.oneOf(r['type'], OBJECTIVE_TYPES, `${op}.type`);
      const target = r['target'] === null && type === 'discover' ? null : issues.string(r['target'], `${op}.target`, { pattern: ID_PATTERN });
      const obj = {
        id: issues.string(r['id'], `${op}.id`, { pattern: ID_PATTERN }),
        type,
        target,
        count: issues.number(r['count'], `${op}.count`, { integer: true, min: 1, max: 999 }),
        description: issues.string(r['description'], `${op}.description`),
      };
      return obj.id && obj.type && obj.target !== undefined && obj.count !== undefined && obj.description
        ? [obj as QuestObjective]
        : [];
    });
    if (objectives.length === 0) issues.add(`${p}.objectives`, 'una misión necesita al menos un objetivo');
    const rw = issues.record(q['rewards'], `${p}.rewards`) ?? {};
    const def = {
      id: issues.string(q['id'], `${p}.id`, { pattern: ID_PATTERN }),
      name: issues.string(q['name'], `${p}.name`),
      description: issues.string(q['description'], `${p}.description`),
      giver: issues.string(q['giver'], `${p}.giver`, { pattern: ID_PATTERN }),
      prerequisites: (issues.array(q['prerequisites'] ?? [], `${p}.prerequisites`) ?? []).filter(
        (x, j): x is string => issues.string(x, `${p}.prerequisites[${j}]`, { pattern: ID_PATTERN }) !== undefined,
      ),
      objectives,
      rewards: {
        xp: issues.number(rw['xp'], `${p}.rewards.xp`, { integer: true, min: 0 }) ?? 0,
        items: (issues.array(rw['items'] ?? [], `${p}.rewards.items`) ?? []).flatMap((it, j) => {
          const r = issues.record(it, `${p}.rewards.items[${j}]`);
          const itemId = r ? issues.string(r['itemId'], `${p}.rewards.items[${j}].itemId`, { pattern: ID_PATTERN }) : undefined;
          const quantity = r ? issues.number(r['quantity'], `${p}.rewards.items[${j}].quantity`, { integer: true, min: 1 }) : undefined;
          return itemId && quantity !== undefined ? [{ itemId, quantity }] : [];
        }),
      },
    };
    if (def.id && all.has(def.id)) issues.add(`${p}.id`, `identificador duplicado "${def.id}"`);
    if (issues.count === before) all.set(def.id as string, def as QuestDefinition);
  });
  for (const q of all.values()) {
    for (const pre of q.prerequisites) if (!all.has(pre)) issues.add(`$.quests[${q.id}]`, `requisito "${pre}" inexistente`);
  }
  issues.throwIfAny(source);
  return {
    all,
    get(id) {
      const d = all.get(id);
      if (!d) throw new Error(`Misión desconocida: "${id}"`);
      return d;
    },
  };
}

export type QuestStatus = 'locked' | 'available' | 'active' | 'completed' | 'turned-in';

/** Señales del mundo que hacen avanzar los objetivos (desacopladas de los eventos de la simulación). */
export type QuestSignal =
  | { readonly kind: 'defeat'; readonly target: string }
  | { readonly kind: 'gather'; readonly target: string; readonly amount: number }
  | { readonly kind: 'discover'; readonly target: string };

export type QuestUpdate =
  | { readonly type: 'quest-progress'; readonly questId: string; readonly objectiveId: string; readonly current: number; readonly count: number }
  | { readonly type: 'quest-completed'; readonly questId: string };

interface QuestRecord {
  state: 'active' | 'completed' | 'turned-in';
  readonly progress: Record<string, number>;
}

export interface QuestLogJSON {
  readonly [questId: string]: { readonly state: 'active' | 'completed' | 'turned-in'; readonly progress: Record<string, number> };
}

/** Registro de misiones del jugador (GAME_DESIGN §15: estado de misiones). */
export class QuestLog {
  private readonly catalog: QuestCatalog;
  private readonly records = new Map<string, QuestRecord>();

  constructor(catalog: QuestCatalog) {
    this.catalog = catalog;
  }

  status(id: string): QuestStatus {
    const r = this.records.get(id);
    if (r) return r.state;
    const def = this.catalog.get(id);
    return def.prerequisites.every((p) => this.records.get(p)?.state === 'turned-in') ? 'available' : 'locked';
  }

  progress(id: string, objectiveId: string): number {
    return this.records.get(id)?.progress[objectiveId] ?? 0;
  }

  /** Misiones aceptadas y no entregadas, en orden de aceptación. */
  active(): QuestDefinition[] {
    return [...this.records].filter(([, r]) => r.state !== 'turned-in').map(([id]) => this.catalog.get(id));
  }

  accept(id: string): boolean {
    if (this.status(id) !== 'available') return false;
    const progress: Record<string, number> = {};
    for (const o of this.catalog.get(id).objectives) progress[o.id] = 0;
    this.records.set(id, { state: 'active', progress });
    return true;
  }

  /** Aplica una señal del mundo a los objetivos activos. */
  signal(s: QuestSignal): QuestUpdate[] {
    const updates: QuestUpdate[] = [];
    for (const [id, r] of this.records) {
      if (r.state !== 'active') continue;
      for (const o of this.catalog.get(id).objectives) {
        if (o.type !== s.kind || (o.target !== null && o.target !== s.target)) continue;
        const before = r.progress[o.id] ?? 0;
        if (before >= o.count) continue;
        const amount = s.kind === 'gather' ? s.amount : 1;
        r.progress[o.id] = Math.min(o.count, before + amount);
        updates.push({ type: 'quest-progress', questId: id, objectiveId: o.id, current: r.progress[o.id] ?? 0, count: o.count });
      }
      updates.push(...this.checkCompletion(id, r));
    }
    return updates;
  }

  /** Revisa los objetivos de tipo "collect" con las cantidades actuales del inventario. */
  refreshCollect(countOf: (itemId: string) => number): QuestUpdate[] {
    const updates: QuestUpdate[] = [];
    for (const [id, r] of this.records) {
      if (r.state === 'turned-in') continue;
      for (const o of this.catalog.get(id).objectives) {
        if (o.type !== 'collect' || o.target === null) continue;
        const now = Math.min(o.count, countOf(o.target));
        if (now === r.progress[o.id]) continue;
        r.progress[o.id] = now;
        updates.push({ type: 'quest-progress', questId: id, objectiveId: o.id, current: now, count: o.count });
        if (r.state === 'completed' && now < o.count) r.state = 'active';
      }
      updates.push(...this.checkCompletion(id, r));
    }
    return updates;
  }

  private checkCompletion(id: string, r: QuestRecord): QuestUpdate[] {
    if (r.state !== 'active') return [];
    const done = this.catalog.get(id).objectives.every((o) => (r.progress[o.id] ?? 0) >= o.count);
    if (!done) return [];
    r.state = 'completed';
    return [{ type: 'quest-completed', questId: id }];
  }

  /** Marca la misión como entregada y devuelve sus recompensas, o null si no estaba completada. */
  turnIn(id: string): QuestDefinition['rewards'] | null {
    const r = this.records.get(id);
    if (r?.state !== 'completed') return null;
    r.state = 'turned-in';
    return this.catalog.get(id).rewards;
  }

  toJSON(): QuestLogJSON {
    const out: Record<string, { state: QuestRecord['state']; progress: Record<string, number> }> = {};
    for (const [id, r] of this.records) out[id] = { state: r.state, progress: { ...r.progress } };
    return out;
  }

  restore(data: QuestLogJSON): void {
    this.records.clear();
    for (const [id, r] of Object.entries(data)) {
      if (!this.catalog.all.has(id)) continue;
      this.records.set(id, { state: r.state, progress: { ...r.progress } });
    }
  }
}
