import type { StatModifier } from '../combat/stats.ts';
import type { EquipmentSetCatalog } from './equipmentSets.ts';
import { EQUIP_SLOTS, type EquipSlot, type ItemCatalog } from './itemCatalog.ts';

export interface ActiveSet {
  readonly setId: string;
  readonly name: string;
  readonly equipped: number;
  readonly total: number;
  /** Umbrales de piezas cuyas bonificaciones están activas. */
  readonly activeThresholds: readonly number[];
}

/** Ranuras equipadas y cálculo de los modificadores que aportan (piezas + bonificaciones de set). */
export class Equipment {
  private readonly slots = new Map<EquipSlot, string>();
  private readonly items: ItemCatalog;
  private readonly sets: EquipmentSetCatalog;

  constructor(items: ItemCatalog, sets: EquipmentSetCatalog) {
    this.items = items;
    this.sets = sets;
  }

  get(slot: EquipSlot): string | null {
    return this.slots.get(slot) ?? null;
  }

  /** Coloca el objeto en su ranura y devuelve el que estaba antes (sin tocar el inventario). */
  put(itemId: string): string | null {
    const equip = this.items.get(itemId).equip;
    if (!equip) throw new Error(`"${itemId}" no es equipable`);
    const previous = this.get(equip.slot);
    this.slots.set(equip.slot, itemId);
    return previous;
  }

  take(slot: EquipSlot): string | null {
    const previous = this.get(slot);
    this.slots.delete(slot);
    return previous;
  }

  activeSets(): ActiveSet[] {
    const counts = new Map<string, number>();
    for (const id of this.slots.values()) {
      const setId = this.items.get(id).equip?.setId;
      if (setId) counts.set(setId, (counts.get(setId) ?? 0) + 1);
    }
    return [...counts].map(([setId, equipped]) => {
      const set = this.sets.get(setId);
      return {
        setId,
        name: set.name,
        equipped,
        total: set.pieces.length,
        activeThresholds: set.bonuses.filter((b) => b.pieces <= equipped).map((b) => b.pieces),
      };
    });
  }

  modifiers(): StatModifier[] {
    const mods: StatModifier[] = [];
    for (const id of this.slots.values()) mods.push(...(this.items.get(id).equip?.modifiers ?? []));
    for (const active of this.activeSets()) {
      for (const b of this.sets.get(active.setId).bonuses) if (b.pieces <= active.equipped) mods.push(...b.modifiers);
    }
    return mods;
  }

  toJSON(): Partial<Record<EquipSlot, string>> {
    const out: Partial<Record<EquipSlot, string>> = {};
    for (const slot of EQUIP_SLOTS) {
      const id = this.get(slot);
      if (id) out[slot] = id;
    }
    return out;
  }
}
