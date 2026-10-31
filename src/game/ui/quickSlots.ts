import type Phaser from 'phaser';
import type { PlayerCharacter } from '../../core/character/playerCharacter.ts';
import { itemIconKey } from '../rendering/itemIcons.ts';

const SLOT = 44;
const GAP = 6;
const TEXT = { fontFamily: 'monospace', color: '#e6e1cf', stroke: '#000', strokeThickness: 3 } as const;

/** Consumibles rápidos (inferior derecha, GAME_DESIGN §12) con cantidad y recuperación compartida. */
export class QuickSlotsView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly counts: Phaser.GameObjects.Text[] = [];
  private readonly keyLabels: Phaser.GameObjects.Text[] = [];
  private readonly hint: Phaser.GameObjects.Text;
  private readonly keys: readonly string[];
  private x = 0;
  private y = 0;
  private signature = '';

  constructor(scene: Phaser.Scene, keys: readonly string[]) {
    this.keys = keys;
    this.g = scene.add.graphics();
    keys.forEach((k) => {
      this.icons.push(scene.add.image(0, 0, '__MISSING').setVisible(false).setScale(1.3));
      this.counts.push(scene.add.text(0, 0, '', { ...TEXT, fontSize: '11px' }).setOrigin(1, 1));
      this.keyLabels.push(scene.add.text(0, 0, k, { ...TEXT, fontSize: '10px', color: '#f2d16b' }));
    });
    this.hint = scene.add.text(0, 0, 'I: inventario', { ...TEXT, fontSize: '11px', color: '#a9a596' }).setOrigin(1, 1);
  }

  setKeyLabels(labels: readonly string[], inventoryKey: string): void {
    this.keyLabels.forEach((t, i) => t.setText(labels[i] ?? ''));
    this.hint.setText(`${inventoryKey}: inventario`);
  }

  layout(right: number, bottom: number): void {
    const width = this.keys.length * SLOT + (this.keys.length - 1) * GAP;
    this.x = right - width;
    this.y = bottom - SLOT - 16;
    this.keys.forEach((_, i) => {
      const sx = this.x + i * (SLOT + GAP);
      this.icons[i]?.setPosition(sx + SLOT / 2, this.y + SLOT / 2);
      this.counts[i]?.setPosition(sx + SLOT - 3, this.y + SLOT - 2);
      this.keyLabels[i]?.setPosition(sx + 3, this.y + 2);
    });
    this.hint.setPosition(right, bottom);
  }

  update(character: PlayerCharacter, now: number): void {
    const cd = character.itemCooldownRatio(now);
    const sig = `${Math.ceil(cd * 20)}|${this.x},${this.y}|` + character.quickSlots.map((id) => (id ? `${id}:${character.inventory.count(id)}` : '-')).join(',');
    if (sig === this.signature) return;
    this.signature = sig;
    const g = this.g.clear();
    this.keys.forEach((_, i) => {
      const sx = this.x + i * (SLOT + GAP);
      const itemId = character.quickSlots[i] ?? null;
      const count = itemId ? character.inventory.count(itemId) : 0;
      g.fillStyle(0x161a22, 0.9).fillRoundedRect(sx, this.y, SLOT, SLOT, 5);
      g.lineStyle(2, 0x8a8f9c, 1).strokeRoundedRect(sx, this.y, SLOT, SLOT, 5);
      const icon = this.icons[i];
      if (itemId && icon) icon.setTexture(itemIconKey(itemId)).setVisible(true).setAlpha(count > 0 ? 1 : 0.3);
      else icon?.setVisible(false);
      this.counts[i]?.setText(itemId ? String(count) : '');
      if (itemId && cd > 0) g.fillStyle(0x000000, 0.55).fillRect(sx, this.y + SLOT * (1 - cd), SLOT, SLOT * cd);
    });
  }
}
