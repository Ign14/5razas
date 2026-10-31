import type Phaser from 'phaser';
import type { PlantNode } from '../../core/ecosystem/plants.ts';
import { cellToScreen, type IsoMetrics } from '../../core/math/iso.ts';
import { sortedDepth } from '../rendering/depth.ts';
import { plantTextureKey } from '../rendering/placeholderTextures.ts';

/** Planta recolectable. Madura: color pleno y leve brillo; en crecimiento o fuera de horario: atenuada. */
export class PlantView {
  private readonly sprite: Phaser.GameObjects.Image;
  private ready: boolean | null = null;

  constructor(scene: Phaser.Scene, node: PlantNode, iso: IsoMetrics) {
    const p = cellToScreen(node.position, iso);
    this.sprite = scene.add.image(p.x, p.y, plantTextureKey(node.plantId)).setOrigin(0.5, 25 / 28);
    this.sprite.setDepth(sortedDepth(p.y));
  }

  sync(ready: boolean): void {
    if (ready === this.ready) return;
    this.ready = ready;
    this.sprite.setAlpha(ready ? 1 : 0.35).setScale(ready ? 1 : 0.7);
    if (ready) this.sprite.clearTint();
    else this.sprite.setTint(0x8a8f7c);
  }
}
