import type Phaser from 'phaser';
import type { ItemCatalog } from '../../core/items/itemCatalog.ts';
import type { WorldDrop } from '../../core/items/worldDrops.ts';
import { cellToScreen, type IsoMetrics } from '../../core/math/iso.ts';
import { sortedDepth } from '../rendering/depth.ts';
import { itemIconKey, RARITY_COLORS } from '../rendering/itemIcons.ts';

/** Objeto en el suelo: icono flotante con un halo del color de su rareza. */
export class DropView {
  private readonly icon: Phaser.GameObjects.Image;
  private readonly halo: Phaser.GameObjects.Ellipse;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, drop: WorldDrop, items: ItemCatalog, iso: IsoMetrics) {
    this.scene = scene;
    const p = cellToScreen(drop.position, iso);
    const rarity = items.get(drop.itemId).rarity;
    const depth = sortedDepth(p.y);
    this.halo = scene.add.ellipse(p.x, p.y, 22, 10, RARITY_COLORS[rarity], 0.35).setDepth(depth);
    this.icon = scene.add.image(p.x, p.y - 14, itemIconKey(drop.itemId)).setDepth(depth + 0.1);
    scene.tweens.add({ targets: this.icon, y: p.y - 18, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (rarity !== 'common') {
      scene.tweens.add({ targets: this.halo, alpha: 0.15, duration: 600, yoyo: true, repeat: -1 });
    }
  }

  /** Animación de recogida (sube y se desvanece) o de caducidad. */
  remove(collected: boolean): void {
    this.scene.tweens.killTweensOf([this.icon, this.halo]);
    this.halo.destroy();
    this.scene.tweens.add({
      targets: this.icon,
      y: this.icon.y - (collected ? 22 : 0),
      alpha: 0,
      duration: collected ? 250 : 600,
      onComplete: () => { this.icon.destroy(); },
    });
  }
}
