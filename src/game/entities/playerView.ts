import type Phaser from 'phaser';
import type { Combatant } from '../../core/combat/combatant.ts';
import { cellToScreen, type IsoMetrics } from '../../core/math/iso.ts';
import type { MotionState } from '../../core/movement/characterMotion.ts';
import { ENTITY_DEPTH_BIAS, sortedDepth } from '../rendering/depth.ts';
import { PLAYER_ORIGIN_Y, PLAYER_TEXTURE } from '../rendering/placeholderTextures.ts';
import { applyCombatVisuals } from './combatVisuals.ts';

const HURT_FLASH = 0.1;

/** Representación gráfica del jugador. Solo refleja el estado; no contiene reglas. */
export class PlayerView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly barrier: Phaser.GameObjects.Graphics;
  private readonly iso: IsoMetrics;
  private hurtFlashUntil = 0;

  constructor(scene: Phaser.Scene, state: MotionState, iso: IsoMetrics) {
    this.iso = iso;
    this.sprite = scene.add.sprite(0, 0, PLAYER_TEXTURE, 0).setOrigin(0.5, PLAYER_ORIGIN_Y);
    this.barrier = scene.add.graphics();
    const p = cellToScreen(state.position, iso);
    this.sprite.setPosition(p.x, p.y);
  }

  hurt(time: number): void {
    this.hurtFlashUntil = time + HURT_FLASH;
  }

  sync(state: MotionState, combatant: Combatant, time: number): void {
    const p = cellToScreen(state.position, this.iso);
    const depth = sortedDepth(p.y) + ENTITY_DEPTH_BIAS;
    this.sprite.setPosition(p.x, p.y).setDepth(depth).setVisible(combatant.alive);
    const anim = `player-${state.moving ? 'walk' : 'idle'}-${state.facing}`;
    if (this.sprite.anims.currentAnim?.key !== anim) this.sprite.play(anim, true);
    applyCombatVisuals(this.sprite, combatant, time, this.hurtFlashUntil, 0);

    // Barrera de "Protección del Bosque".
    this.barrier.clear();
    if (combatant.alive && combatant.statuses.has('protection')) {
      const pulse = 0.55 + Math.sin(time * 6) * 0.15;
      this.barrier.setDepth(depth + 0.1);
      this.barrier.lineStyle(2, 0x7fd3ff, pulse).strokeEllipse(p.x, p.y - 18, 40, 46);
      this.barrier.fillStyle(0x7fd3ff, 0.12).fillEllipse(p.x, p.y - 18, 40, 46);
    }
  }
}
