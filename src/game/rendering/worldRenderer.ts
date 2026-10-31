import type Phaser from 'phaser';
import { cellToScreen, tileCenterToScreen } from '../../core/math/iso.ts';
import { MAP_LAYERS } from '../../core/world/tileCatalog.ts';
import type { WorldMap } from '../../core/world/worldMap.ts';
import { LAYER_DEPTH, sortedDepth } from './depth.ts';
import { FLAT_TEXTURE_H, TILE_ORIGIN_Y, TILE_TEXTURE_W, tileTextureKey } from './placeholderTextures.ts';

/** Lado (en celdas) de los bloques de culling. */
const CHUNK = 4;
/** Margen en píxeles alrededor de la cámara. */
const CULL_MARGIN = 48;
/** Altura que sobresalen los objetos (árboles) por encima de su rombo. */
const OBJECT_OVERHANG = 80;

interface Chunk {
  /** Rombo del bloque en pantalla: centro y semiejes. */
  readonly diamond: { readonly cx: number; readonly cy: number; readonly hw: number; readonly hh: number };
  readonly images: Phaser.GameObjects.Image[];
  readonly bobs: Phaser.GameObjects.Bob[];
  visible: boolean;
}

/**
 * Dibuja un WorldMap. Las capas planas usan un Blitter por textura (muy barato de
 * renderizar); los objetos altos se crean como Images en la banda ordenada por Y.
 * Los elementos se agrupan en bloques de 8 × 8 celdas y solo se dibujan los que intersectan
 * la cámara (culling, GAME_DESIGN §14).
 */
export class WorldRenderer {
  private readonly objects: Phaser.GameObjects.Image[] = [];
  /** Objeto por celda (índice y * width + x), para la transparencia por oclusión. */
  private readonly objectAt = new Map<number, Phaser.GameObjects.Image>();
  private faded: Phaser.GameObjects.Image[] = [];
  private readonly mapWidth: number;
  private readonly blitters: Phaser.GameObjects.Blitter[] = [];
  private readonly chunks: Chunk[] = [];
  private lastView = '';

  constructor(scene: Phaser.Scene, map: WorldMap) {
    this.mapWidth = map.width;
    const offsetX = -TILE_TEXTURE_W / 2;
    // Las capas planas usan texturas de 64 × 32: el centro del rombo está en la mitad.
    const offsetY = -FLAT_TEXTURE_H / 2;
    const chunksX = Math.ceil(map.width / CHUNK);
    for (let cy = 0; cy < Math.ceil(map.height / CHUNK); cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        // Un bloque cuadrado en celdas es un rombo en pantalla.
        const center = cellToScreen({ x: (cx + 0.5) * CHUNK, y: (cy + 0.5) * CHUNK }, map.iso);
        this.chunks.push({
          diamond: { cx: center.x, cy: center.y, hw: (CHUNK * map.iso.tileWidth) / 2, hh: (CHUNK * map.iso.tileHeight) / 2 },
          images: [],
          bobs: [],
          visible: true,
        });
      }
    }
    const chunkOf = (x: number, y: number) => this.chunks[Math.floor(y / CHUNK) * chunksX + Math.floor(x / CHUNK)] as Chunk;

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
            this.objectAt.set(y * map.width + x, img);
            chunkOf(x, y).images.push(img);
          } else {
            let blitter = perTexture.get(key);
            if (!blitter) {
              blitter = scene.add.blitter(0, 0, key).setDepth(LAYER_DEPTH[layer]);
              perTexture.set(key, blitter);
              this.blitters.push(blitter);
            }
            chunkOf(x, y).bobs.push(blitter.create(p.x + offsetX, p.y + offsetY));
          }
        }
      }
    }
  }

  /** Muestra solo los bloques que intersectan la vista de la cámara (más un margen). */
  cull(view: Phaser.Geom.Rectangle): void {
    const key = `${Math.round(view.x / 32)},${Math.round(view.y / 32)},${Math.round(view.width)},${Math.round(view.height)}`;
    if (key === this.lastView) return;
    this.lastView = key;
    const left = view.x - CULL_MARGIN;
    const right = view.right + CULL_MARGIN;
    const top = view.y - CULL_MARGIN;
    // Los objetos de un bloque bajo el borde inferior pueden asomar hacia arriba.
    const bottom = view.bottom + CULL_MARGIN + OBJECT_OVERHANG;
    for (const c of this.chunks) {
      // Intersección exacta rombo–rectángulo: el punto del rectángulo más cercano al centro del rombo
      // (en norma L1 escalada) es el centro recortado al rectángulo.
      const d = c.diamond;
      const nx = Math.min(Math.max(d.cx, left), right);
      const ny = Math.min(Math.max(d.cy, top), bottom);
      const visible = Math.abs(nx - d.cx) / d.hw + Math.abs(ny - d.cy) / d.hh <= 1;
      if (visible === c.visible) continue;
      c.visible = visible;
      for (const img of c.images) img.setVisible(visible);
      for (const bob of c.bobs) bob.setVisible(visible);
    }
  }

  /** Elementos del mapa que se están dibujando y el total (para el indicador de rendimiento). */
  stats(): { visible: number; total: number } {
    let visible = 0;
    let total = 0;
    for (const c of this.chunks) {
      const n = c.images.length + c.bobs.length;
      total += n;
      if (c.visible) visible += n;
    }
    return { visible, total };
  }

  /**
   * Vuelve semitransparentes los objetos altos que tapan a una entidad en `cell`: los que están
   * delante (mayor x + y) y cuyo sprite de 64 × 96 px cubre su posición en pantalla.
   */
  updateOcclusion(cell: { x: number; y: number }): void {
    for (const img of this.faded) img.setAlpha(1);
    this.faded = [];
    const px = Math.floor(cell.x);
    const py = Math.floor(cell.y);
    for (let dy = -1; dy <= 5; dy++) {
      for (let dx = -1; dx <= 5; dx++) {
        const sum = dx + dy;
        const x = px + dx;
        if (sum <= 0 || sum > 5 || Math.abs(dx - dy) > 1 || x < 0 || x >= this.mapWidth) continue;
        const img = this.objectAt.get((py + dy) * this.mapWidth + x);
        if (!img) continue;
        img.setAlpha(0.45);
        this.faded.push(img);
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
