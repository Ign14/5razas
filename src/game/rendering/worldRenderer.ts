import type Phaser from 'phaser';
import { tileCenterToScreen } from '../../core/math/iso.ts';
import { MAP_LAYERS } from '../../core/world/tileCatalog.ts';
import type { WorldMap } from '../../core/world/worldMap.ts';
import { LAYER_DEPTH, sortedDepth } from './depth.ts';
import { TILE_ORIGIN_Y, TILE_TEXTURE_H, TILE_TEXTURE_W, tileTextureKey } from './placeholderTextures.ts';

/**
 * Dibuja un WorldMap. Las capas planas usan un Blitter por textura (muy barato de
 * renderizar); los objetos altos se crean como Images en la banda ordenada por Y.
 */
export class WorldRenderer {
  private readonly objects: Phaser.GameObjects.Image[] = [];
  private readonly blitters: Phaser.GameObjects.Blitter[] = [];

  constructor(scene: Phaser.Scene, map: WorldMap) {
    const offsetX = -TILE_TEXTURE_W / 2;
    const offsetY = -TILE_TEXTURE_H * TILE_ORIGIN_Y;

    for (const layer of MAP_LAYERS) {
      const perTexture = new Map<string, Phaser.GameObjects.Blitter>();
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tileId = map.tileAt(layer, x, y);
          if (tileId === null) continue;
          const p = tileCenterToScreen(x, y, map.iso);
          const key = tileTextureKey(tileId);
          if (layer === 'objects') {
            const img = scene.add.image(p.x, p.y, key).setOrigin(0.5, TILE_ORIGIN_Y);
            img.setDepth(sortedDepth(p.y));
            this.objects.push(img);
          } else {
            let blitter = perTexture.get(key);
            if (!blitter) {
              blitter = scene.add.blitter(0, 0, key).setDepth(LAYER_DEPTH[layer]);
              perTexture.set(key, blitter);
              this.blitters.push(blitter);
            }
            blitter.create(p.x + offsetX, p.y + offsetY);
          }
        }
      }
    }
  }

  get objectCount(): number {
    return this.objects.length;
  }

  destroy(): void {
    this.objects.forEach((o) => { o.destroy(); });
    this.blitters.forEach((b) => { b.destroy(); });
  }
}
