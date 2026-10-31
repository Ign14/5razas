import type Phaser from 'phaser';
import { cellToScreen } from '../../core/math/iso.ts';
import { directionAngle } from '../../core/movement/direction.ts';
import type { Vec2 } from '../../core/math/vector.ts';
import type { GameSession } from '../session.ts';

/** Métrica isométrica reducida del minimapa: cada celda es un rombo de 4 × 2 px. */
const MINI = { tileWidth: 4, tileHeight: 2 } as const;
const FOG_COLOR: readonly [number, number, number] = [16, 18, 24];
const TEXTURE_KEY = 'ui-minimap';
const PADDING = 6;

function rgb(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Minimapa con niebla de exploración (GAME_DESIGN §3.4): dibuja el terreno descubierto en
 * proyección isométrica y un marcador con la posición y orientación del jugador.
 */
export class Minimap {
  private readonly session: GameSession;
  private readonly canvas: Phaser.Textures.CanvasTexture;
  private readonly image: ImageData;
  private readonly frame: Phaser.GameObjects.Rectangle;
  private readonly view: Phaser.GameObjects.Image;
  private readonly marker: Phaser.GameObjects.Graphics;
  private readonly originX: number;
  private readonly unsubscribe: () => void;
  private dirty = true;
  readonly width: number;
  readonly height: number;

  constructor(scene: Phaser.Scene, session: GameSession) {
    this.session = session;
    const { map } = session;
    this.width = (map.width + map.height) * (MINI.tileWidth / 2);
    this.height = (map.width + map.height) * (MINI.tileHeight / 2);
    this.originX = map.height * (MINI.tileWidth / 2);

    scene.textures.remove(TEXTURE_KEY);
    const canvas = scene.textures.createCanvas(TEXTURE_KEY, this.width, this.height);
    if (!canvas) throw new Error('No se pudo crear la textura del minimapa');
    this.canvas = canvas;
    this.image = canvas.context.createImageData(this.width, this.height);

    this.frame = scene.add
      .rectangle(0, 0, this.width + PADDING * 2, this.height + PADDING * 2, 0x0b0d12, 0.82)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xc9a85a, 0.9);
    this.view = scene.add.image(0, 0, TEXTURE_KEY).setOrigin(0, 0);
    this.marker = scene.add.graphics();

    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) this.paintCell(x, y);
    this.unsubscribe = session.onReveal((cells) => {
      cells.forEach((c) => { this.paintCell(c.x, c.y); });
      this.dirty = true;
    });
  }

  /** Coloca el minimapa con su esquina superior derecha en (right, top). */
  layout(right: number, top: number): void {
    const x = right - this.width - PADDING * 2;
    this.frame.setPosition(x, top);
    this.view.setPosition(x + PADDING, top + PADDING);
  }

  /** Convierte una posición en celdas a coordenadas locales del minimapa. */
  toMinimap(p: Vec2): Vec2 {
    const s = cellToScreen(p, MINI);
    return { x: s.x + this.originX, y: s.y };
  }

  private paintCell(x: number, y: number): void {
    const { map, exploration } = this.session;
    const tile = map.surfaceTile(x, y);
    const color =
      exploration.isExplored(x, y) && tile !== null ? rgb(map.catalog.get(tile).minimapColor) : FOG_COLOR;
    const top = this.toMinimap({ x, y });
    // Rombo de 4 × 2 px: fila superior de 2 px y fila inferior de 4 px.
    this.fill(top.x - 1, top.y, 2, color);
    this.fill(top.x - 2, top.y + 1, 4, color);
  }

  private fill(x0: number, y: number, w: number, [r, g, b]: readonly [number, number, number]): void {
    if (y < 0 || y >= this.height) return;
    for (let x = Math.max(0, x0); x < Math.min(this.width, x0 + w); x++) {
      const i = (y * this.width + x) * 4;
      this.image.data[i] = r;
      this.image.data[i + 1] = g;
      this.image.data[i + 2] = b;
      this.image.data[i + 3] = 255;
    }
  }

  update(): void {
    if (this.dirty) {
      this.canvas.context.putImageData(this.image, 0, 0);
      this.canvas.refresh();
      this.dirty = false;
    }
    const { position, facing } = this.session.player;
    const local = this.toMinimap(position);
    const cx = this.view.x + local.x;
    const cy = this.view.y + local.y;
    const a = directionAngle(facing);
    const tip = (r: number, da: number) => ({ x: cx + Math.cos(a + da) * r, y: cy + Math.sin(a + da) * r });
    const t0 = tip(6, 0);
    const t1 = tip(4, 2.4);
    const t2 = tip(4, -2.4);
    this.marker.clear();
    this.marker.fillStyle(0xffffff, 1).fillTriangle(t0.x, t0.y, t1.x, t1.y, t2.x, t2.y);
    this.marker.fillStyle(0xe8483a, 1).fillCircle(cx, cy, 2);
  }

  destroy(): void {
    this.unsubscribe();
    this.frame.destroy();
    this.view.destroy();
    this.marker.destroy();
  }
}
