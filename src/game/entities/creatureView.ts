import type Phaser from 'phaser';
import { cellToScreen, type IsoMetrics } from '../../core/math/iso.ts';
import type { CreatureInstance } from '../../core/simulation/worldSimulation.ts';
import { ENTITY_DEPTH_BIAS, sortedDepth } from '../rendering/depth.ts';
import { CREATURE_ORIGIN_Y } from '../rendering/placeholderTextures.ts';
import { applyCombatVisuals, HealthBar } from './combatVisuals.ts';

const HURT_FLASH = 0.1;

/** Representación de una criatura. Se destruye con una animación al ser derrotada. */
export class CreatureView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly bar: HealthBar;
  private readonly alertMark: Phaser.GameObjects.Text;
  private readonly iso: IsoMetrics;
  private readonly scene: Phaser.Scene;
  private hurtFlashUntil = 0;
  private telegraphUntil = 0;

  constructor(scene: Phaser.Scene, creature: CreatureInstance, iso: IsoMetrics) {
    this.scene = scene;
    this.iso = iso;
    const key = creature.def.spriteAtlas;
    this.sprite = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, CREATURE_ORIGIN_Y);
    this.sprite.play(`${key}-idle`);
    this.sprite.setAlpha(0);
    scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 400 });
    this.bar = new HealthBar(scene);
    this.alertMark = scene.add
      .text(0, 0, '!', { fontFamily: 'monospace', fontSize: '16px', color: '#ffd84a', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  hurt(time: number): void {
    this.hurtFlashUntil = time + HURT_FLASH;
  }

  telegraph(until: number): void {
    this.telegraphUntil = until;
  }

  clearTelegraph(): void {
    this.telegraphUntil = 0;
  }

  sync(c: CreatureInstance, time: number): void {
    const p = cellToScreen(c.combatant.position, this.iso);
    const depth = sortedDepth(p.y) + ENTITY_DEPTH_BIAS;
    this.sprite.setPosition(p.x, p.y).setDepth(depth);
    // Las texturas provisionales miran a la derecha: se espejan según la orientación.
    this.sprite.setFlipX(c.motion.facing.includes('w'));
    applyCombatVisuals(this.sprite, c.combatant, time, this.hurtFlashUntil, this.telegraphUntil);
    this.bar.draw(p.x, p.y - 38, c.combatant.hp / c.combatant.stats.life, depth + 0.2);
    // Estado de alerta de la fauna (GAME_DESIGN §8).
    const alert = c.brain.state === 'alert' || c.brain.state === 'flee';
    this.alertMark.setVisible(alert).setPosition(p.x, p.y - 40).setDepth(depth + 0.3);
    this.alertMark.setColor(c.brain.state === 'flee' ? '#ff8a3a' : '#ffd84a');
  }

  /** Desaparición silenciosa (fuera de horario, lejos del jugador). */
  despawn(): void {
    this.bar.destroy();
    this.alertMark.destroy();
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, duration: 400, onComplete: () => { this.sprite.destroy(); } });
  }

  /** Animación de derrota y liberación de recursos. */
  defeat(): void {
    this.bar.destroy();
    this.alertMark.destroy();
    this.sprite.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 0.2,
      duration: 350,
      onComplete: () => { this.sprite.destroy(); },
    });
  }
}
