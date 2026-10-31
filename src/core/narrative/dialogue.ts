import { ID_PATTERN, Issues } from '../data/validate.ts';
import type { QuestLog, QuestStatus } from '../quests/quests.ts';

/** Personaje no jugador con diálogos que dependen del estado de las misiones. */
export interface NpcDefinition {
  readonly id: string;
  readonly name: string;
  readonly spriteAtlas: string;
  /** Reglas evaluadas en orden; la primera que se cumple elige el diálogo. */
  readonly dialogue: readonly { readonly when: { readonly quest: string; readonly status: QuestStatus } | null; readonly dialogueId: string }[];
}

export type DialogueAction =
  | { readonly type: 'close' }
  | { readonly type: 'goto'; readonly next: string }
  | { readonly type: 'accept'; readonly questId: string; readonly next: string | null }
  | { readonly type: 'turn-in'; readonly questId: string; readonly next: string | null };

export interface DialogueNode {
  readonly id: string;
  readonly speaker: string;
  readonly lines: readonly string[];
  readonly options: readonly { readonly text: string; readonly action: DialogueAction }[];
}

export interface NarrativeCatalog {
  readonly npcs: ReadonlyMap<string, NpcDefinition>;
  readonly dialogues: ReadonlyMap<string, DialogueNode>;
}

const STATUSES: readonly QuestStatus[] = ['locked', 'available', 'active', 'completed', 'turned-in'];

export function parseNarrative(npcsRaw: unknown, dialoguesRaw: unknown, source: string): NarrativeCatalog {
  const issues = new Issues();
  const dialogues = new Map<string, DialogueNode>();
  issues.array(issues.record(dialoguesRaw, '$dialogues')?.['dialogues'], '$dialogues.dialogues')?.forEach((entry, i) => {
    const p = `$dialogues.dialogues[${i}]`;
    const d = issues.record(entry, p);
    if (!d) return;
    const before = issues.count;
    const options = (issues.array(d['options'], `${p}.options`) ?? []).flatMap((o, j) => {
      const op = `${p}.options[${j}]`;
      const r = issues.record(o, op);
      if (!r) return [];
      const a = issues.record(r['action'], `${op}.action`) ?? {};
      const type = issues.oneOf(a['type'], ['close', 'goto', 'accept', 'turn-in'] as const, `${op}.action.type`);
      const next = a['next'] === undefined || a['next'] === null ? null : (issues.string(a['next'], `${op}.action.next`, { pattern: ID_PATTERN }) ?? null);
      let action: DialogueAction | undefined;
      if (type === 'close') action = { type };
      else if (type === 'goto') action = next ? { type, next } : undefined;
      else if (type === 'accept' || type === 'turn-in') {
        const questId = issues.string(a['questId'], `${op}.action.questId`, { pattern: ID_PATTERN });
        action = questId ? { type, questId, next } : undefined;
      }
      if (type === 'goto' && !next) issues.add(`${op}.action.next`, '"goto" necesita "next"');
      const text = issues.string(r['text'], `${op}.text`);
      return action && text ? [{ text, action }] : [];
    });
    if (options.length === 0) issues.add(`${p}.options`, 'un diálogo necesita al menos una opción');
    const node = {
      id: issues.string(d['id'], `${p}.id`, { pattern: ID_PATTERN }),
      speaker: issues.string(d['speaker'], `${p}.speaker`),
      lines: (issues.array(d['lines'], `${p}.lines`) ?? []).filter((l, j): l is string => issues.string(l, `${p}.lines[${j}]`) !== undefined),
      options,
    };
    if (node.id && dialogues.has(node.id)) issues.add(`${p}.id`, `identificador duplicado "${node.id}"`);
    if (issues.count === before) dialogues.set(node.id as string, node as DialogueNode);
  });

  const npcs = new Map<string, NpcDefinition>();
  issues.array(issues.record(npcsRaw, '$npcs')?.['npcs'], '$npcs.npcs')?.forEach((entry, i) => {
    const p = `$npcs.npcs[${i}]`;
    const n = issues.record(entry, p);
    if (!n) return;
    const before = issues.count;
    const rules = (issues.array(n['dialogue'], `${p}.dialogue`) ?? []).flatMap((r, j) => {
      const rp = `${p}.dialogue[${j}]`;
      const rr = issues.record(r, rp);
      if (!rr) return [];
      let when: NpcDefinition['dialogue'][number]['when'] = null;
      if (rr['when'] !== null && rr['when'] !== undefined) {
        const w = issues.record(rr['when'], `${rp}.when`) ?? {};
        const quest = issues.string(w['quest'], `${rp}.when.quest`, { pattern: ID_PATTERN });
        const status = issues.oneOf(w['status'], STATUSES, `${rp}.when.status`);
        when = quest && status ? { quest, status } : null;
      }
      const dialogueId = issues.string(rr['dialogueId'], `${rp}.dialogueId`, { pattern: ID_PATTERN });
      if (dialogueId && !dialogues.has(dialogueId)) issues.add(`${rp}.dialogueId`, `diálogo "${dialogueId}" inexistente`);
      return dialogueId ? [{ when, dialogueId }] : [];
    });
    if (rules.length === 0 || rules[rules.length - 1]?.when !== null) issues.add(`${p}.dialogue`, 'la última regla debe ser incondicional (when: null)');
    const def = {
      id: issues.string(n['id'], `${p}.id`, { pattern: ID_PATTERN }),
      name: issues.string(n['name'], `${p}.name`),
      spriteAtlas: issues.string(n['spriteAtlas'], `${p}.spriteAtlas`),
      dialogue: rules,
    };
    if (issues.count === before) npcs.set(def.id as string, def as NpcDefinition);
  });
  for (const d of dialogues.values()) {
    for (const o of d.options) {
      const next = o.action.type === 'close' ? null : o.action.next;
      if (next && !dialogues.has(next)) issues.add(`$dialogues[${d.id}]`, `diálogo siguiente "${next}" inexistente`);
    }
  }
  issues.throwIfAny(source);
  return { npcs, dialogues };
}

/** Diálogo que corresponde al PNJ según el estado actual de las misiones. */
export function selectDialogue(npc: NpcDefinition, quests: QuestLog): string {
  for (const rule of npc.dialogue) {
    if (rule.when === null || quests.status(rule.when.quest) === rule.when.status) return rule.dialogueId;
  }
  throw new Error(`El PNJ "${npc.id}" no tiene diálogo por defecto`);
}
