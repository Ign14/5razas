import Phaser from 'phaser';
import { STAT_KEYS } from '../../core/combat/stats.ts';
import { EQUIP_SLOTS, type EquipSlot, type ItemCategory, type ItemDefinition } from '../../core/items/itemCatalog.ts';
import type { GameContent } from '../content.ts';
import { itemIconKey, RARITY_COLORS, RARITY_NAMES } from '../rendering/itemIcons.ts';
import type { GameSession } from '../session.ts';
import type { ItemResult } from '../../core/character/playerCharacter.ts';
import { CATEGORY_NAMES, formatModifier, formatStat, ITEM_FAILURE_TEXT, SLOT_NAMES, STAT_NAMES } from '../ui/texts.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

const PANEL_W = 820;
const PANEL_H = 470;
const CELL = 50;
const COLS = 6;
const TEXT = { fontFamily: 'monospace', color: '#e6e1cf' } as const;

type Selection = { kind: 'inventory'; index: number } | { kind: 'equipment'; slot: EquipSlot } | null;

/** Filtros por categoría (GAME_DESIGN §11). */
const FILTERS: readonly { label: string; categories: readonly ItemCategory[] | null }[] = [
  { label: 'Todo', categories: null },
  { label: 'Consumibles', categories: ['consumable'] },
  { label: 'Ingredientes', categories: ['ingredient'] },
  { label: 'Materiales', categories: ['material'] },
  { label: 'Equipo', categories: ['weapon', 'armor', 'accessory'] },
  { label: 'Misión', categories: ['quest'] },
];

/**
 * Inventario y equipamiento. Mientras está abierto la simulación queda en pausa.
 * Toda acción pasa por WorldSimulation (equip/unequip/useItem), nunca modifica datos directamente.
 */
export class InventoryScene extends Phaser.Scene {
  private session!: GameSession;
  private content!: GameContent;
  private layer!: Phaser.GameObjects.Container;
  private selection: Selection = null;
  private filter = 0;
  private message = '';

  constructor() {
    super(SceneKeys.Inventory);
  }

  init(data: { session: GameSession }): void {
    this.session = data.session;
    this.selection = null;
    this.message = '';
  }

  create(): void {
    this.content = this.registry.get(REGISTRY_CONTENT) as GameContent;
    this.session.paused = true;
    this.layer = this.add.container(0, 0);
    this.input.keyboard?.on('keydown-ESC', () => { this.close(); });
    this.scale.on('resize', () => { this.render(); }, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', undefined, this);
      this.session.paused = false;
    });
    this.render();
  }

  close(): void {
    this.session.paused = false;
    this.scene.stop();
  }

  private get origin(): { x: number; y: number } {
    return {
      x: Math.round((this.scale.width - PANEL_W) / 2),
      y: Math.max(8, Math.round((this.scale.height - PANEL_H) / 2) - 20),
    };
  }

  private text(x: number, y: number, s: string, size = 12, color = '#e6e1cf'): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, { ...TEXT, fontSize: `${size}px`, color });
    this.layer.add(t);
    return t;
  }

  private button(x: number, y: number, label: string, onClick: () => void, w = 112): void {
    const r = this.add.rectangle(x, y, w, 24, 0x2a3140).setOrigin(0).setStrokeStyle(1, 0xc9a85a);
    r.setInteractive({ useHandCursor: true })
      .on('pointerover', () => r.setFillStyle(0x3a4458))
      .on('pointerout', () => r.setFillStyle(0x2a3140))
      .on('pointerdown', onClick);
    this.layer.add(r);
    this.text(x + w / 2, y + 5, label, 12).setOrigin(0.5, 0);
  }

  private slotBox(x: number, y: number, itemId: string | null, selected: boolean, onClick: () => void, quantity = 0): void {
    const def = itemId ? this.content.items.get(itemId) : null;
    const box = this.add
      .rectangle(x, y, CELL - 4, CELL - 4, 0x161a22)
      .setOrigin(0)
      .setStrokeStyle(selected ? 2 : 1, selected ? 0xf2d16b : def ? RARITY_COLORS[def.rarity] : 0x3a3f4a);
    box.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    this.layer.add(box);
    if (itemId) {
      this.layer.add(this.add.image(x + (CELL - 4) / 2, y + (CELL - 4) / 2, itemIconKey(itemId)).setScale(1.5));
      if (quantity > 1) this.text(x + CELL - 7, y + CELL - 19, String(quantity), 11).setOrigin(1, 0).setStroke('#000', 3);
    }
  }

  private render(): void {
    this.layer.removeAll(true);
    const sim = this.session.sim;
    const character = sim.character;
    const { x: ox, y: oy } = this.origin;

    const dim = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55).setOrigin(0).setInteractive();
    this.layer.add(dim);
    this.layer.add(this.add.rectangle(ox, oy, PANEL_W, PANEL_H, 0x0b0d12, 0.96).setOrigin(0).setStrokeStyle(2, 0xc9a85a));
    this.text(ox + 16, oy + 12, 'Equipo', 16, '#e8c872');
    this.text(ox + 290, oy + 12, `Inventario (${character.inventory.contents.filter(Boolean).length}/${character.inventory.capacity})`, 16, '#e8c872');
    this.button(ox + PANEL_W - 96, oy + 10, 'Cerrar (I)', () => { this.close(); }, 84);

    // --- Equipo ---
    EQUIP_SLOTS.forEach((slot, i) => {
      const sx = ox + 16 + (i % 3) * 84;
      const sy = oy + 44 + Math.floor(i / 3) * 74;
      this.text(sx, sy, SLOT_NAMES[slot], 10, '#a9a596');
      const sel = this.selection?.kind === 'equipment' && this.selection.slot === slot;
      this.slotBox(sx, sy + 14, character.equipment.get(slot), sel, () => {
        this.selection = { kind: 'equipment', slot };
        this.message = '';
        this.render();
      });
    });

    // --- Atributos ---
    const stats = sim.player.stats;
    this.text(ox + 16, oy + 200, `Nivel ${character.level} · ${character.stage.name}`, 12, '#9fe870');
    STAT_KEYS.forEach((k, i) => {
      const sx = ox + 16 + (i % 2) * 130;
      const sy = oy + 222 + Math.floor(i / 2) * 18;
      this.text(sx, sy, `${STAT_NAMES[k]}: ${formatStat(k, stats[k])}`, 11);
    });

    // --- Conjuntos activos ---
    let sy = oy + 318;
    this.text(ox + 16, sy, 'Conjuntos', 12, '#e8c872');
    sy += 18;
    const active = character.equipment.activeSets();
    if (active.length === 0) this.text(ox + 16, sy, 'Ninguno', 11, '#7a7f8c');
    for (const set of active) {
      this.text(ox + 16, sy, `${set.name} (${set.equipped}/${set.total})`, 11);
      sy += 15;
      for (const b of this.content.sets.get(set.setId).bonuses) {
        const on = set.activeThresholds.includes(b.pieces);
        this.text(ox + 26, sy, `${b.pieces}: ${b.modifiers.map(formatModifier).join(', ')}`, 10, on ? '#9fe870' : '#6a6f7c');
        sy += 14;
      }
    }

    // --- Filtros e inventario ---
    FILTERS.forEach((f, i) => {
      const fx = ox + 290 + i * 87;
      const on = i === this.filter;
      const r = this.add.rectangle(fx, oy + 40, 84, 20, on ? 0x3a4458 : 0x161a22).setOrigin(0).setStrokeStyle(1, on ? 0xf2d16b : 0x3a3f4a);
      r.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.filter = i;
        this.render();
      });
      this.layer.add(r);
      this.text(fx + 42, oy + 43, f.label, 10).setOrigin(0.5, 0);
    });
    const cats = FILTERS[this.filter]?.categories ?? null;
    const visible = character.inventory.contents
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => cats === null || (s !== null && cats.includes(this.content.items.get(s.itemId).category)));
    visible.forEach(({ s, index }, i) => {
      const gx = ox + 290 + (i % COLS) * CELL;
      const gy = oy + 70 + Math.floor(i / COLS) * CELL;
      const sel = this.selection?.kind === 'inventory' && this.selection.index === index;
      this.slotBox(gx, gy, s?.itemId ?? null, sel, () => {
        this.selection = s ? { kind: 'inventory', index } : null;
        this.message = '';
        this.render();
      }, s?.quantity ?? 0);
    });

    this.renderDetails(ox + 600, oy + 70);
  }

  /** Panel de detalle del objeto seleccionado con sus acciones. */
  private renderDetails(x: number, y: number): void {
    const sim = this.session.sim;
    const character = sim.character;
    const sel = this.selection;
    const itemId =
      sel?.kind === 'inventory' ? (character.inventory.at(sel.index)?.itemId ?? null) : sel ? character.equipment.get(sel.slot) : null;
    if (!sel || !itemId) {
      this.text(x, y, 'Selecciona un objeto', 11, '#7a7f8c');
      return;
    }
    const def: ItemDefinition = this.content.items.get(itemId);
    const color = `#${RARITY_COLORS[def.rarity].toString(16).padStart(6, '0')}`;
    let ty = y;
    const line = (s: string, size = 11, c = '#e6e1cf') => {
      const t = this.text(x, ty, s, size, c).setWordWrapWidth(205);
      ty += t.height + 4;
    };
    line(def.name, 13, color);
    line(`${CATEGORY_NAMES[def.category]} · ${RARITY_NAMES[def.rarity]}`, 10, '#a9a596');
    line(def.description, 11);
    if (def.equip) {
      const ok = character.level >= def.equip.levelRequirement;
      line(`Requiere nivel ${def.equip.levelRequirement}`, 11, ok ? '#a9a596' : '#ff6a5a');
      for (const m of def.equip.modifiers) line(formatModifier(m), 11, '#9fe870');
      if (def.equip.setId) line(`Conjunto: ${this.content.sets.get(def.equip.setId).name}`, 11, '#e8c872');
    }
    if (def.use) for (const e of def.use.effects) line(e.kind === 'heal' ? `Restaura ${e.amount} de vida` : `Restaura ${e.amount} de energía`, 11, '#9fe870');
    ty += 6;

    const act = (label: string, fn: () => ItemResult) => {
      this.button(x, ty, label, () => {
        const r = fn();
        this.message = r.ok ? '' : ITEM_FAILURE_TEXT[r.reason] || 'No se pudo realizar la acción';
        if (r.ok && sel.kind === 'inventory' && !character.inventory.at(sel.index)) this.selection = null;
        if (r.ok && sel.kind === 'equipment') this.selection = null;
        this.render();
      }, 150);
      ty += 30;
    };
    if (sel.kind === 'equipment') act('Quitar', () => sim.unequip(sel.slot));
    else if (def.equip) act('Equipar', () => sim.equip(sel.index));
    if (sel.kind === 'inventory' && def.use) {
      act('Usar', () => sim.useItem(itemId));
      act('Asignar a Q', () => character.assignQuickSlot(0, itemId));
      act('Asignar a F', () => character.assignQuickSlot(1, itemId));
    }
    if (this.message) line(this.message, 11, '#ff6a5a');
  }
}
