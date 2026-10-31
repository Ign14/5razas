import type Phaser from 'phaser';
import type { AbilityDefinition } from '../../core/combat/abilities.ts';
import type { Combatant } from '../../core/combat/combatant.ts';
import type { ActionSlot } from '../../core/professions/profession.ts';

const SLOT = 52;
const GAP = 8;
const TEXT = { fontFamily: 'monospace', color: '#e6e1cf', stroke: '#000', strokeThickness: 3 } as const;

export interface ActionBarSlot {
  readonly slot: ActionSlot;
  readonly key: string;
  readonly ability: AbilityDefinition;
}

/** Barra inferior central: cinco acciones + evasión, con indicadores de recarga y energía. */
export class ActionBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly slots: readonly ActionBarSlot[];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly timers: Phaser.GameObjects.Text[] = [];
  private readonly keys: Phaser.GameObjects.Text[] = [];
  private readonly flashUntil = new Map<ActionSlot, number>();
  private x = 0;
  private y = 0;
  private signature = '';

  constructor(scene: Phaser.Scene, slots: readonly ActionBarSlot[]) {
    this.g = scene.add.graphics();
    this.slots = slots;
    for (const s of slots) {
      const short = s.ability.name.split(' ').map((w) => w[0]).join('').slice(0, 3);
      this.labels.push(scene.add.text(0, 0, short, { ...TEXT, fontSize: '15px' }).setOrigin(0.5));
      this.timers.push(scene.add.text(0, 0, '', { ...TEXT, fontSize: '14px', color: '#ffffff' }).setOrigin(0.5));
      this.keys.push(scene.add.text(0, 0, s.key, { ...TEXT, fontSize: '10px', color: '#f2d16b' }).setOrigin(0, 0));
    }
  }

  get width(): number {
    return this.slots.length * SLOT + (this.slots.length - 1) * GAP;
  }

  layout(centerX: number, bottom: number): void {
    this.x = centerX - this.width / 2;
    this.y = bottom - SLOT;
    this.slots.forEach((_, i) => {
      const sx = this.x + i * (SLOT + GAP);
      this.labels[i]?.setPosition(sx + SLOT / 2, this.y + SLOT / 2 - 4);
      this.timers[i]?.setPosition(sx + SLOT / 2, this.y + SLOT / 2 + 12);
      this.keys[i]?.setPosition(sx + 3, this.y + 2);
    });
  }

  setKeyLabels(labels: Readonly<Record<ActionSlot, string>>): void {
    this.slots.forEach((s, i) => this.keys[i]?.setText(labels[s.slot]));
  }

  /** Resalta en rojo una ranura (p. ej. sin energía). */
  flash(slot: ActionSlot, now: number): void {
    this.flashUntil.set(slot, now + 0.35);
  }

  update(player: Combatant, now: number): void {
    // Solo se redibuja si cambian recuperaciones (en décimas), energía disponible, nivel o avisos.
    const sig = this.slots
      .map((s) => `${Math.ceil(player.cooldownRemaining(s.ability.id, now) * 10)}${player.energy < s.ability.energyCost ? 'e' : ''}${(this.flashUntil.get(s.slot) ?? 0) > now ? 'f' : ''}`)
      .join(',') + `|${player.level}|${this.x},${this.y}`;
    if (sig === this.signature) return;
    this.signature = sig;
    const g = this.g.clear();
    this.slots.forEach((s, i) => {
      const sx = this.x + i * (SLOT + GAP);
      const remaining = player.cooldownRemaining(s.ability.id, now);
      const total = s.ability.category === 'basic' ? s.ability.cooldown / player.stats.attackRate : s.ability.cooldown;
      const noEnergy = player.energy < s.ability.energyCost;
      const locked = player.level < s.ability.unlockLevel;
      const flashing = (this.flashUntil.get(s.slot) ?? 0) > now;

      g.fillStyle(s.slot === 'final' ? 0x3a2a12 : 0x161a22, 0.9).fillRoundedRect(sx, this.y, SLOT, SLOT, 5);
      if (remaining > 0 && total > 0) {
        g.fillStyle(0x000000, 0.6).fillRect(sx, this.y + SLOT * (1 - remaining / total), SLOT, SLOT * (remaining / total));
      }
      if (noEnergy && !locked) g.fillStyle(0x1a3a6a, 0.45).fillRoundedRect(sx, this.y, SLOT, SLOT, 5);
      if (locked) g.fillStyle(0x000000, 0.7).fillRoundedRect(sx, this.y, SLOT, SLOT, 5);
      g.lineStyle(2, flashing ? 0xff4a3a : s.slot === 'final' ? 0xe8c872 : 0x8a8f9c, 1).strokeRoundedRect(
        sx,
        this.y,
        SLOT,
        SLOT,
        5,
      );
      const timer = remaining > 0.05 && total >= 1 ? remaining.toFixed(remaining < 3 ? 1 : 0) : '';
      this.timers[i]?.setText(locked ? `Nv ${s.ability.unlockLevel}` : timer).setColor(locked ? '#f2d16b' : '#ffffff');
      this.labels[i]?.setAlpha(locked ? 0.25 : remaining > 0 || noEnergy ? 0.5 : 1);
    });
  }
}
