import { STAT_KEYS, type StatModifier } from '../combat/stats.ts';
import { HEX_COLOR_PATTERN, ID_PATTERN, Issues, type Json } from '../data/validate.ts';

/** Categorías de inventario (GAME_DESIGN §11). */
export const ITEM_CATEGORIES = ['consumable', 'ingredient', 'material', 'weapon', 'armor', 'accessory', 'quest'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const EQUIP_SLOTS = ['weapon', 'head', 'chest', 'legs', 'feet', 'accessory'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Forma del icono provisional generado por código. */
export const ICON_SHAPES = ['potion', 'blade', 'helm', 'chest', 'legs', 'boots', 'amulet', 'shard', 'dust', 'leaf'] as const;
export type IconShape = (typeof ICON_SHAPES)[number];

export const USE_EFFECTS = ['heal', 'restoreEnergy'] as const;
export type UseEffectKind = (typeof USE_EFFECTS)[number];

/** Qué categorías se equipan y en qué ranuras pueden ir. */
const CATEGORY_SLOTS: Readonly<Partial<Record<ItemCategory, readonly EquipSlot[]>>> = {
  weapon: ['weapon'],
  armor: ['head', 'chest', 'legs', 'feet'],
  accessory: ['accessory'],
};

export interface EquipData {
  readonly slot: EquipSlot;
  readonly levelRequirement: number;
  readonly modifiers: readonly StatModifier[];
  readonly setId: string | null;
}

export interface UseData {
  readonly effects: readonly { readonly kind: UseEffectKind; readonly amount: number }[];
  /** Recuperación compartida por todos los consumibles (s). */
  readonly cooldown: number;
}

export interface ItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ItemCategory;
  readonly rarity: Rarity;
  readonly maxStack: number;
  readonly icon: { readonly shape: IconShape; readonly color: string };
  readonly equip: EquipData | null;
  readonly use: UseData | null;
}

export interface ItemCatalog {
  readonly all: ReadonlyMap<string, ItemDefinition>;
  get(id: string): ItemDefinition;
}

export function parseModifiers(issues: Issues, raw: unknown, path: string, source: string): StatModifier[] {
  return (issues.array(raw, path) ?? []).flatMap((m, i) => {
    const r = issues.record(m, `${path}[${i}]`);
    if (!r) return [];
    const stat = issues.oneOf(r['stat'], STAT_KEYS, `${path}[${i}].stat`);
    const op = issues.oneOf(r['op'], ['add', 'mul'] as const, `${path}[${i}].op`);
    const value = issues.number(r['value'], `${path}[${i}].value`, { min: -10_000, max: 10_000 });
    return stat && op && value !== undefined ? [{ stat, op, value, source }] : [];
  });
}

function parseItem(issues: Issues, it: Json, p: string): ItemDefinition | undefined {
  const before = issues.count;
  const id = issues.string(it['id'], `${p}.id`, { pattern: ID_PATTERN });
  const category = issues.oneOf(it['category'], ITEM_CATEGORIES, `${p}.category`);
  const iconRaw = issues.record(it['icon'], `${p}.icon`) ?? {};
  const icon = {
    shape: issues.oneOf(iconRaw['shape'], ICON_SHAPES, `${p}.icon.shape`),
    color: issues.string(iconRaw['color'], `${p}.icon.color`, { pattern: HEX_COLOR_PATTERN }),
  };
  const allowedSlots = category ? CATEGORY_SLOTS[category] : undefined;

  let equip: EquipData | null = null;
  if (it['equip'] !== null && it['equip'] !== undefined) {
    const e = issues.record(it['equip'], `${p}.equip`) ?? {};
    const slot = issues.oneOf(e['slot'], EQUIP_SLOTS, `${p}.equip.slot`);
    if (slot && allowedSlots && !allowedSlots.includes(slot))
      issues.add(`${p}.equip.slot`, `la categoría "${String(category)}" no puede ir en "${slot}"`);
    const setRaw = e['setId'];
    equip = {
      slot: slot ?? 'weapon',
      levelRequirement: issues.number(e['levelRequirement'], `${p}.equip.levelRequirement`, { integer: true, min: 1, max: 100 }) ?? 1,
      modifiers: parseModifiers(issues, e['modifiers'], `${p}.equip.modifiers`, id ?? '?'),
      setId: setRaw === null || setRaw === undefined ? null : (issues.string(setRaw, `${p}.equip.setId`, { pattern: ID_PATTERN }) ?? null),
    };
  }
  if (allowedSlots && !equip) issues.add(`${p}.equip`, 'los objetos equipables necesitan "equip"');
  if (!allowedSlots && equip) issues.add(`${p}.equip`, `la categoría "${String(category)}" no es equipable`);

  let use: UseData | null = null;
  if (it['use'] !== null && it['use'] !== undefined) {
    const u = issues.record(it['use'], `${p}.use`) ?? {};
    const effects = (issues.array(u['effects'], `${p}.use.effects`) ?? []).flatMap((ef, i) => {
      const r = issues.record(ef, `${p}.use.effects[${i}]`);
      if (!r) return [];
      const kind = issues.oneOf(r['kind'], USE_EFFECTS, `${p}.use.effects[${i}].kind`);
      const amount = issues.number(r['amount'], `${p}.use.effects[${i}].amount`, { min: 1, max: 100_000 });
      return kind && amount !== undefined ? [{ kind, amount }] : [];
    });
    if (effects.length === 0) issues.add(`${p}.use.effects`, 'necesita al menos un efecto');
    use = { effects, cooldown: issues.number(u['cooldown'], `${p}.use.cooldown`, { min: 0, max: 600 }) ?? 0 };
  }
  if (category === 'consumable' && !use) issues.add(`${p}.use`, 'los consumibles necesitan "use"');

  const maxStack = issues.number(it['maxStack'], `${p}.maxStack`, { integer: true, min: 1, max: 999 });
  if (equip && maxStack !== undefined && maxStack !== 1) issues.add(`${p}.maxStack`, 'el equipo no se apila (debe ser 1)');

  const def = {
    id,
    name: issues.string(it['name'], `${p}.name`),
    description: issues.string(it['description'], `${p}.description`),
    category,
    rarity: issues.oneOf(it['rarity'], RARITIES, `${p}.rarity`),
    maxStack,
    icon,
    equip,
    use,
  };
  return issues.count === before ? (def as ItemDefinition) : undefined;
}

export function parseItemCatalog(raw: unknown, source: string): ItemCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const all = new Map<string, ItemDefinition>();
  issues.array(root?.['items'], '$.items')?.forEach((entry, i) => {
    const p = `$.items[${i}]`;
    const it = issues.record(entry, p);
    if (!it) return;
    const def = parseItem(issues, it, p);
    if (!def) return;
    if (all.has(def.id)) issues.add(`${p}.id`, `identificador duplicado "${def.id}"`);
    all.set(def.id, def);
  });
  issues.throwIfAny(source);
  return {
    all,
    get(id) {
      const d = all.get(id);
      if (!d) throw new Error(`Objeto desconocido: "${id}"`);
      return d;
    },
  };
}
