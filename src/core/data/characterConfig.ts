import { ID_PATTERN, Issues } from './validate.ts';

/**
 * Configuración del personaje controlado. Los atributos (incluida la velocidad) provienen de la
 * profesión elegida.
 */
export interface CharacterConfig {
  readonly id: string;
  readonly name: string;
  readonly professionId: string;
  readonly colliderHalfSize: number;
  /** Radio, en celdas, que el personaje revela en la niebla de exploración. */
  readonly visionRadius: number;
  readonly inventoryCapacity: number;
  readonly startingItems: readonly { readonly itemId: string; readonly quantity: number }[];
  readonly startingEquipment: readonly string[];
  /** Objetos asignados inicialmente a las ranuras rápidas (Q, F). */
  readonly startingQuickSlots: readonly (string | null)[];
}

export function parseCharacterConfig(raw: unknown, source: string): CharacterConfig {
  const issues = new Issues();
  const r = issues.record(raw, '$') ?? {};
  const cfg = {
    id: issues.string(r['id'], '$.id', { pattern: ID_PATTERN }),
    name: issues.string(r['name'], '$.name'),
    professionId: issues.string(r['professionId'], '$.professionId', { pattern: ID_PATTERN }),
    colliderHalfSize: issues.number(r['colliderHalfSize'], '$.colliderHalfSize', { min: 0.05, max: 0.49 }),
    visionRadius: issues.number(r['visionRadius'], '$.visionRadius', { min: 1, max: 64 }),
    inventoryCapacity: issues.number(r['inventoryCapacity'], '$.inventoryCapacity', { integer: true, min: 1, max: 200 }),
    startingItems: (issues.array(r['startingItems'], '$.startingItems') ?? []).flatMap((it, i) => {
      const e = issues.record(it, `$.startingItems[${i}]`);
      if (!e) return [];
      const itemId = issues.string(e['itemId'], `$.startingItems[${i}].itemId`, { pattern: ID_PATTERN });
      const quantity = issues.number(e['quantity'], `$.startingItems[${i}].quantity`, { integer: true, min: 1, max: 999 });
      return itemId && quantity !== undefined ? [{ itemId, quantity }] : [];
    }),
    startingEquipment: (issues.array(r['startingEquipment'], '$.startingEquipment') ?? []).filter(
      (x, i): x is string => issues.string(x, `$.startingEquipment[${i}]`, { pattern: ID_PATTERN }) !== undefined,
    ),
    startingQuickSlots: (issues.array(r['startingQuickSlots'], '$.startingQuickSlots') ?? []).map((x, i) =>
      x === null ? null : (issues.string(x, `$.startingQuickSlots[${i}]`, { pattern: ID_PATTERN }) ?? null),
    ),
  };
  issues.throwIfAny(source);
  return cfg as CharacterConfig;
}
