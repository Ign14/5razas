import type Phaser from 'phaser';
import type { Combatant } from '../../core/combat/combatant.ts';

/** Tinte por estado alterado activo (prioridad en este orden). */
const STATUS_TINTS: readonly [string, number][] = [
  ['burn', 0xffa060],
  ['poison', 0x9be36b],
  ['slow', 0x8fb8ff],
];

/**
 * Refleja visualmente el estado de combate: destello al recibir daño, parpadeo durante la
 * invulnerabilidad, tinte por estados y aviso durante la preparación de un ataque.
 */
export function applyCombatVisuals(
  sprite: Phaser.GameObjects.Sprite,
  c: Combatant,
  time: number,
  hurtFlashUntil: number,
  telegraphUntil: number,
): void {
  if (time < hurtFlashUntil) {
    sprite.setTintFill(0xffffff);
  } else if (time < telegraphUntil) {
    sprite.setTint(0xff6a5a);
  } else {
    const tint = STATUS_TINTS.find(([id]) => c.statuses.has(id))?.[1];
    if (tint === undefined) sprite.clearTint();
    else sprite.setTint(tint);
  }
  // Parpadeo de invulnerabilidad (solo jugador; la evasión no parpadea).
  if (c.team === 'player') {
    const blinking = c.isInvulnerable(time) && c.dash === null;
    sprite.setAlpha(blinking && Math.floor(time * 20) % 2 === 0 ? 0.35 : 1);
  }
}

/** Barra de vida sobre la cabeza; oculta mientras la vida esté completa. */
export class HealthBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly width: number;

  constructor(scene: Phaser.Scene, width = 28) {
    this.g = scene.add.graphics();
    this.width = width;
  }

  draw(x: number, y: number, ratio: number, depth: number): void {
    this.g.clear().setDepth(depth);
    if (ratio >= 1) return;
    const w = this.width;
    this.g.fillStyle(0x000000, 0.7).fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    this.g.fillStyle(ratio > 0.35 ? 0xd94a3a : 0xff2a1a, 1).fillRect(x - w / 2, y, Math.max(0, w * ratio), 3);
  }

  destroy(): void {
    this.g.destroy();
  }
}
