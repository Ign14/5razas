import type { AbilityCatalog } from '../combat/abilities.ts';
import type { Combatant } from '../combat/combatant.ts';
import { applyModifiers, type Stats } from '../combat/stats.ts';
import { Equipment } from '../items/equipment.ts';
import type { EquipmentSetCatalog } from '../items/equipmentSets.ts';
import { Inventory } from '../items/inventory.ts';
import type { EquipSlot, ItemCatalog } from '../items/itemCatalog.ts';
import type { ProfessionDefinition } from '../professions/profession.ts';
import {
  levelForTotalXp,
  stageFor,
  statsAtLevel,
  totalXpForLevel,
  xpToNext,
  type ProgressionConfig,
  type Stage,
} from '../progression/progression.ts';

export const QUICK_SLOT_COUNT = 2;

export type ItemFailure =
  | 'missing'
  | 'not-equippable'
  | 'level'
  | 'inventory-full'
  | 'not-usable'
  | 'cooldown'
  | 'no-effect'
  | 'dead';
export type ItemResult = { readonly ok: true } | { readonly ok: false; readonly reason: ItemFailure };

export interface LevelUp {
  readonly level: number;
  /** Habilidades de la profesión desbloqueadas exactamente en este nivel. */
  readonly unlockedAbilities: readonly string[];
}

export interface CharacterContent {
  readonly profession: ProfessionDefinition;
  readonly abilities: AbilityCatalog;
  readonly items: ItemCatalog;
  readonly sets: EquipmentSetCatalog;
  readonly progression: ProgressionConfig;
  readonly inventoryCapacity: number;
}

/**
 * Progresión, inventario y equipamiento del jugador. Calcula los atributos finales
 * (base + crecimiento por nivel + equipo y conjuntos) sin conocer el combate ni Phaser.
 */
export class PlayerCharacter {
  readonly inventory: Inventory;
  readonly equipment: Equipment;
  readonly quickSlots: (string | null)[] = new Array<string | null>(QUICK_SLOT_COUNT).fill(null);
  private readonly content: CharacterContent;
  private totalXp = 0;
  private currentLevel = 1;
  private itemReadyAt = 0;
  private itemCooldownTotal = 0;

  constructor(content: CharacterContent) {
    this.content = content;
    this.inventory = new Inventory(content.inventoryCapacity, content.items);
    this.equipment = new Equipment(content.items, content.sets);
  }

  get level(): number {
    return this.currentLevel;
  }

  get xp(): number {
    return this.totalXp;
  }

  get stage(): Stage {
    return stageFor(this.content.progression, this.currentLevel);
  }

  /** Progreso dentro del nivel actual: [XP obtenida en el nivel, XP necesaria]. */
  get levelProgress(): { readonly current: number; readonly needed: number } {
    const cfg = this.content.progression;
    return {
      current: this.totalXp - totalXpForLevel(cfg, this.currentLevel),
      needed: xpToNext(cfg, this.currentLevel),
    };
  }

  itemCooldownRemaining(time: number): number {
    return Math.max(0, this.itemReadyAt - time);
  }

  /** Fracción restante (0..1) de la recuperación compartida de consumibles. */
  itemCooldownRatio(time: number): number {
    return this.itemCooldownTotal > 0 ? this.itemCooldownRemaining(time) / this.itemCooldownTotal : 0;
  }

  /** Atributos finales: base de la profesión + crecimiento por nivel + equipo y conjuntos. */
  computeStats(): Stats {
    const { profession } = this.content;
    return applyModifiers(statsAtLevel(profession.baseStats, profession.statsPerLevel, this.currentLevel), this.equipment.modifiers());
  }

  /** Suma experiencia y devuelve los niveles ganados (puede ser más de uno). */
  addXp(amount: number): LevelUp[] {
    if (amount <= 0) return [];
    const cfg = this.content.progression;
    this.totalXp += Math.round(amount);
    const newLevel = levelForTotalXp(cfg, this.totalXp);
    const ups: LevelUp[] = [];
    for (let l = this.currentLevel + 1; l <= newLevel; l++) {
      const unlockedAbilities = Object.values(this.content.profession.abilities).filter(
        (id) => this.content.abilities.get(id).unlockLevel === l,
      );
      ups.push({ level: l, unlockedAbilities });
    }
    this.currentLevel = newLevel;
    return ups;
  }

  /** Restaura un estado guardado o de prueba: fija la XP total y recalcula el nivel. */
  restoreXp(totalXp: number): void {
    this.totalXp = Math.max(0, Math.round(totalXp));
    this.currentLevel = levelForTotalXp(this.content.progression, this.totalXp);
  }

  /** Equipa el objeto de una ranura del inventario; el anterior vuelve al inventario. */
  equipFromInventory(index: number): ItemResult {
    const stack = this.inventory.at(index);
    if (!stack) return { ok: false, reason: 'missing' };
    const equip = this.content.items.get(stack.itemId).equip;
    if (!equip) return { ok: false, reason: 'not-equippable' };
    if (this.currentLevel < equip.levelRequirement) return { ok: false, reason: 'level' };
    this.inventory.removeAt(index, 1);
    const previous = this.equipment.put(stack.itemId);
    // El hueco liberado garantiza espacio para la pieza anterior (el equipo no se apila).
    if (previous) this.inventory.add(previous, 1);
    return { ok: true };
  }

  unequip(slot: EquipSlot): ItemResult {
    const current = this.equipment.get(slot);
    if (!current) return { ok: false, reason: 'missing' };
    if (this.inventory.spaceFor(current) < 1) return { ok: false, reason: 'inventory-full' };
    this.equipment.take(slot);
    this.inventory.add(current, 1);
    return { ok: true };
  }

  /** Usa un consumible del inventario sobre el combatiente del jugador. */
  useItem(itemId: string, player: Combatant, time: number): ItemResult {
    if (!player.alive) return { ok: false, reason: 'dead' };
    if (this.inventory.count(itemId) < 1) return { ok: false, reason: 'missing' };
    const use = this.content.items.get(itemId).use;
    if (!use) return { ok: false, reason: 'not-usable' };
    if (time < this.itemReadyAt) return { ok: false, reason: 'cooldown' };
    const wouldHelp = use.effects.some((e) =>
      e.kind === 'heal' ? player.hp < player.stats.life : player.energy < player.stats.energy,
    );
    if (!wouldHelp) return { ok: false, reason: 'no-effect' };
    for (const e of use.effects) {
      if (e.kind === 'heal') player.hp = Math.min(player.stats.life, player.hp + e.amount);
      else player.energy = Math.min(player.stats.energy, player.energy + e.amount);
    }
    this.inventory.remove(itemId, 1);
    this.itemReadyAt = time + use.cooldown;
    this.itemCooldownTotal = use.cooldown;
    return { ok: true };
  }

  assignQuickSlot(index: number, itemId: string | null): ItemResult {
    if (index < 0 || index >= QUICK_SLOT_COUNT) return { ok: false, reason: 'missing' };
    if (itemId !== null && !this.content.items.get(itemId).use) return { ok: false, reason: 'not-usable' };
    // Un mismo objeto no ocupa dos ranuras rápidas.
    for (let i = 0; i < QUICK_SLOT_COUNT; i++) if (this.quickSlots[i] === itemId) this.quickSlots[i] = null;
    this.quickSlots[index] = itemId;
    return { ok: true };
  }
}
