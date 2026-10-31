import type { ItemFailure } from '../../core/character/playerCharacter.ts';
import type { StatKey, StatModifier } from '../../core/combat/stats.ts';
import type { EquipSlot, ItemCategory } from '../../core/items/itemCatalog.ts';

/** Textos de interfaz en español (presentación; las reglas no dependen de ellos). */
export const STAT_NAMES: Readonly<Record<StatKey, string>> = {
  life: 'Vida',
  energy: 'Energía',
  attack: 'Ataque',
  power: 'Poder',
  defense: 'Defensa',
  resistance: 'Resistencia',
  speed: 'Velocidad',
  attackRate: 'Cadencia',
  crit: 'Crítico',
  evasion: 'Evasión',
};

export const SLOT_NAMES: Readonly<Record<EquipSlot, string>> = {
  weapon: 'Arma',
  head: 'Cabeza',
  chest: 'Torso',
  legs: 'Piernas',
  feet: 'Pies',
  accessory: 'Accesorio',
};

export const CATEGORY_NAMES: Readonly<Record<ItemCategory, string>> = {
  consumable: 'Consumible',
  ingredient: 'Ingrediente',
  material: 'Material',
  weapon: 'Arma',
  armor: 'Armadura',
  accessory: 'Accesorio',
  quest: 'Objeto de misión',
};

export const ITEM_FAILURE_TEXT: Readonly<Record<ItemFailure, string>> = {
  missing: 'No tienes ese objeto',
  'not-equippable': 'No se puede equipar',
  level: 'Nivel insuficiente',
  'inventory-full': 'Inventario lleno',
  'not-usable': 'No se puede usar',
  cooldown: 'Objeto en recuperación',
  'no-effect': 'No lo necesitas ahora',
  dead: '',
};

const PERCENT_STATS: ReadonlySet<StatKey> = new Set(['crit', 'evasion']);

/** Valor de atributo para mostrar (probabilidades como porcentaje). */
export function formatStat(stat: StatKey, value: number): string {
  if (PERCENT_STATS.has(stat)) return `${(value * 100).toFixed(1)} %`;
  if (stat === 'attackRate' || stat === 'speed') return value.toFixed(2);
  return String(Math.round(value));
}

export function formatModifier(m: StatModifier): string {
  if (m.op === 'mul') {
    const pct = Math.round((m.value - 1) * 100);
    return `${pct >= 0 ? '+' : ''}${pct} % ${STAT_NAMES[m.stat]}`;
  }
  const v = PERCENT_STATS.has(m.stat) ? `${(m.value * 100).toFixed(0)} %` : String(m.value);
  return `${m.value >= 0 ? '+' : ''}${v} ${STAT_NAMES[m.stat]}`;
}
