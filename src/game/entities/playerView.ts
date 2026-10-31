import type Phaser from 'phaser';
import { cellToScreen, type IsoMetrics } from '../../core/math/iso.ts';
import type { MotionState } from '../../core/movement/characterMotion.ts';
import { ENTITY_DEPTH_BIAS, sortedDepth } from '../rendering/depth.ts';
import { PLAYER_ORIGIN_Y, PLAYER_TEXTURE } from '../rendering/placeholderTextures.ts';

/** Representación gráfica del jugador. Solo refleja el MotionState; no contiene reglas. */
export class PlayerView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly iso: IsoMetrics;

  constructor(scene: Phaser.Scene, state: MotionState, iso: IsoMetrics) {
    this.iso = iso;
    this.sprite = scene.add.sprite(0, 0, PLAYER_TEXTURE, 0).setOrigin(0.5, PLAYER_ORIGIN_Y);
    this.sync(state);
  }

  sync(state: MotionState): void {
    const p = cellToScreen(state.position, this.iso);
    this.sprite.setPosition(p.x, p.y);
    this.sprite.setDepth(sortedDepth(p.y) + ENTITY_DEPTH_BIAS);
    const anim = `player-${state.moving ? 'walk' : 'idle'}-${state.facing}`;
    if (this.sprite.anims.currentAnim?.key !== anim) this.sprite.play(anim, true);
  }
}
