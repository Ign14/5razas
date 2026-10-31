import type Phaser from 'phaser';
import { DIRECTIONS, directionAngle } from '../../core/movement/direction.ts';
import { hash2 } from '../../core/math/random.ts';
import type { TileCatalog, TileDefinition } from '../../core/world/tileCatalog.ts';

/**
 * Texturas PROVISIONALES generadas por código (pixel art procedural).
 * Todas las claves llevan el prefijo "ph-" para identificarlas y reemplazarlas
 * por sprites definitivos sin tocar la lógica.
 */
export const TILE_TEXTURE_W = 64;
/** Las texturas de tile reservan 64 px de altura sobre el rombo para objetos altos. */
export const TILE_TEXTURE_H = 96;
const DIAMOND_H = 32;
/** Origen vertical que hace coincidir el centro del rombo con la posición proyectada. */
export const TILE_ORIGIN_Y = (TILE_TEXTURE_H - DIAMOND_H / 2) / TILE_TEXTURE_H;

export const PLAYER_TEXTURE = 'ph-player';
export const PLAYER_FRAME_W = 32;
export const PLAYER_FRAME_H = 48;
const PLAYER_FRAMES_PER_DIR = 4;
/** Origen en los pies del personaje. */
export const PLAYER_ORIGIN_Y = 44 / PLAYER_FRAME_H;

export const tileTextureKey = (tileId: string) => `ph-tile-${tileId}`;

function hex(color: string, shift = 0): string {
  const n = parseInt(color.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, v + shift));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

/** Pinta un rombo 64 × 32 píxel a píxel, con ruido de tono determinista. */
function drawDiamond(ctx: CanvasRenderingContext2D, top: number, color: string, seed: number, variance: number) {
  for (let row = 0; row < DIAMOND_H; row++) {
    const half = row < DIAMOND_H / 2 ? (row + 1) * 2 : (DIAMOND_H - row) * 2;
    for (let x = 32 - half; x < 32 + half; x++) {
      const n = hash2(x, row, seed);
      const shift = n < 0.15 ? -variance : n > 0.9 ? variance : 0;
      // Contorno inferior más oscuro para que se lea la cuadrícula.
      const edge = row >= DIAMOND_H / 2 && (x === 32 - half || x === 32 + half - 1) ? -18 : 0;
      ctx.fillStyle = hex(color, shift + edge);
      ctx.fillRect(x, top + row, 1, 1);
    }
  }
}

function drawTile(ctx: CanvasRenderingContext2D, def: TileDefinition, seed: number) {
  const base = TILE_TEXTURE_H - DIAMOND_H;
  switch (def.shape) {
    case 'flat':
      drawDiamond(ctx, base, def.color, seed, 12);
      break;
    case 'water':
      drawDiamond(ctx, base, def.color, seed, 6);
      ctx.fillStyle = hex(def.color, 45);
      for (const [x, y, w] of [[20, 10, 6], [36, 16, 8], [26, 21, 5]] as const) ctx.fillRect(x, base + y, w, 1);
      break;
    case 'tree': {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(32, base + 16, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5b3b22';
      ctx.fillRect(29, base - 8, 6, 26);
      const blobs = [[32, 26, 18], [22, 38, 12], [42, 38, 12], [32, 44, 14]] as const;
      blobs.forEach(([cx, cy, r], k) => {
        ctx.fillStyle = hex(def.color, k * 8 - 8);
        for (let y = -r; y <= r; y++) {
          for (let x = -r; x <= r; x++) {
            if (x * x + y * y <= r * r) {
              const n = hash2(cx + x, cy + y, seed + k);
              ctx.fillStyle = hex(def.color, (n < 0.2 ? -14 : n > 0.85 ? 16 : 0) + (y < 0 ? 10 : -6));
              ctx.fillRect(cx + x, cy + y, 1, 1);
            }
          }
        }
      });
      break;
    }
    case 'rock':
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(32, base + 17, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let y = -10; y <= 8; y++) {
        const w = Math.round(13 * Math.sqrt(1 - ((y + 1) / 11) ** 2));
        for (let x = -w; x <= w; x++) {
          ctx.fillStyle = hex(def.color, (y < -3 ? 22 : 0) + (x > w - 3 ? -20 : 0) + (hash2(x, y, seed) < 0.15 ? -12 : 0));
          ctx.fillRect(32 + x, base + 8 + y, 1, 1);
        }
      }
      break;
  }
}

function drawPlayerFrame(ctx: CanvasRenderingContext2D, ox: number, oy: number, angle: number, frame: number) {
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y, w, h);
  };
  const step = frame === 1 ? 2 : frame === 3 ? -2 : 0;
  const bob = frame % 2 === 1 ? 1 : 0;
  // Sombra.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(ox + 16, oy + 44, 9, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Piernas (alternan al caminar).
  px(11, 33 - bob, 4, 10 + step / 2, '#3b2f2a');
  px(17, 33 - bob, 4, 10 - step / 2, '#3b2f2a');
  // Torso y capa.
  px(9, 19 - bob, 14, 15, '#b0503a');
  px(9, 30 - bob, 14, 3, '#7a3324');
  // Cabeza.
  px(11, 8 - bob, 10, 11, '#d9a77a');
  px(11, 6 - bob, 10, 4, '#2b201c');
  // Indicador de orientación (ojos/frente desplazados hacia la dirección).
  const fx = Math.round(Math.cos(angle) * 3);
  const fy = Math.sin(angle) < -0.3 ? -1 : 0;
  if (Math.sin(angle) > -0.6) {
    px(13 + fx, 12 - bob + fy, 2, 2, '#1a1414');
    px(17 + fx, 12 - bob + fy, 2, 2, '#1a1414');
  }
  // Marca PROVISIONAL.
  px(15, 22 - bob, 2, 6, '#f2d16b');
}

/** Genera todas las texturas provisionales. Idempotente. */
export function createPlaceholderTextures(scene: Phaser.Scene, catalog: TileCatalog): void {
  let seed = 1;
  for (const def of catalog.tiles.values()) {
    const key = tileTextureKey(def.id);
    seed++;
    if (scene.textures.exists(key)) continue;
    const canvas = scene.textures.createCanvas(key, TILE_TEXTURE_W, TILE_TEXTURE_H);
    if (!canvas) throw new Error(`No se pudo crear la textura ${key}`);
    drawTile(canvas.context, def, seed);
    canvas.refresh();
  }

  if (!scene.textures.exists(PLAYER_TEXTURE)) {
    const cols = PLAYER_FRAMES_PER_DIR;
    const canvas = scene.textures.createCanvas(
      PLAYER_TEXTURE,
      PLAYER_FRAME_W * cols,
      PLAYER_FRAME_H * DIRECTIONS.length,
    );
    if (!canvas) throw new Error('No se pudo crear la textura del jugador');
    DIRECTIONS.forEach((dir, row) => {
      for (let f = 0; f < cols; f++) {
        drawPlayerFrame(canvas.context, f * PLAYER_FRAME_W, row * PLAYER_FRAME_H, directionAngle(dir), f);
        canvas.add(row * cols + f, 0, f * PLAYER_FRAME_W, row * PLAYER_FRAME_H, PLAYER_FRAME_W, PLAYER_FRAME_H);
      }
    });
    canvas.refresh();
  }
}

/** Crea las animaciones idle/walk para las 8 orientaciones. */
export function createPlayerAnimations(scene: Phaser.Scene): void {
  DIRECTIONS.forEach((dir, row) => {
    const first = row * PLAYER_FRAMES_PER_DIR;
    if (!scene.anims.exists(`player-idle-${dir}`)) {
      scene.anims.create({ key: `player-idle-${dir}`, frames: [{ key: PLAYER_TEXTURE, frame: first }] });
    }
    if (!scene.anims.exists(`player-walk-${dir}`)) {
      scene.anims.create({
        key: `player-walk-${dir}`,
        frames: [0, 1, 2, 3].map((f) => ({ key: PLAYER_TEXTURE, frame: first + f })),
        frameRate: 8,
        repeat: -1,
      });
    }
  });
}

export const CREATURE_FRAME = 40;
/** Origen en la base de la criatura. */
export const CREATURE_ORIGIN_Y = 36 / CREATURE_FRAME;

type CreaturePainter = (ctx: CanvasRenderingContext2D, ox: number, frame: number) => void;

function shadow(ctx: CanvasRenderingContext2D, ox: number, rx: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(ox + 20, 36, rx, rx * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, seed: number) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const n = hash2(cx + x, cy + y, seed);
      ctx.fillStyle = hex(color, (y < -r / 3 ? 18 : y > r / 3 ? -16 : 0) + (n < 0.12 ? -12 : 0));
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}

/** Pintores provisionales por clave de spriteAtlas. */
const CREATURE_PAINTERS: Readonly<Record<string, CreaturePainter>> = {
  'ph-creature-thorn-sprout': (ctx, ox, frame) => {
    const bob = frame;
    shadow(ctx, ox, 11);
    blob(ctx, ox + 20, 26 - bob, 10, '#4c7a2e', 3);
    ctx.fillStyle = '#d9c27a';
    for (const [x, y] of [[9, 22], [31, 22], [14, 15], [26, 15], [20, 12]] as const) {
      ctx.fillRect(ox + x, y - bob, 2, 2);
    }
    ctx.fillStyle = '#e8483a';
    ctx.fillRect(ox + 16, 25 - bob, 2, 2);
    ctx.fillRect(ox + 22, 25 - bob, 2, 2);
  },
  'ph-creature-ash-moth': (ctx, ox, frame) => {
    const flap = frame === 0 ? 0 : 3;
    shadow(ctx, ox, 7);
    ctx.fillStyle = '#9b958c';
    for (let y = 0; y < 10 - flap; y++) {
      const w = 9 - Math.abs(y - 4);
      ctx.fillRect(ox + 20 - 3 - w, 12 + y + flap, w, 1);
      ctx.fillRect(ox + 20 + 3, 12 + y + flap, w, 1);
    }
    blob(ctx, ox + 20, 18, 3, '#5d5650', 9);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(ox + 18, 15, 1, 1);
    ctx.fillRect(ox + 21, 15, 1, 1);
  },
};

function fallbackPainter(ctx: CanvasRenderingContext2D, ox: number, frame: number) {
  shadow(ctx, ox, 10);
  blob(ctx, ox + 20, 26 - frame, 9, '#a04080', 1);
}

/** Genera una textura de 2 fotogramas para cada atlas de criatura solicitado. */
export function createCreatureTextures(scene: Phaser.Scene, atlasKeys: Iterable<string>): void {
  for (const key of atlasKeys) {
    if (scene.textures.exists(key)) continue;
    const canvas = scene.textures.createCanvas(key, CREATURE_FRAME * 2, CREATURE_FRAME);
    if (!canvas) throw new Error(`No se pudo crear la textura ${key}`);
    const paint = CREATURE_PAINTERS[key] ?? fallbackPainter;
    for (let f = 0; f < 2; f++) {
      paint(canvas.context, f * CREATURE_FRAME, f);
      canvas.add(f, 0, f * CREATURE_FRAME, 0, CREATURE_FRAME, CREATURE_FRAME);
    }
    canvas.refresh();
    if (!scene.anims.exists(`${key}-idle`)) {
      scene.anims.create({
        key: `${key}-idle`,
        frames: [0, 1].map((frame) => ({ key, frame })),
        frameRate: key.includes('moth') ? 10 : 3,
        repeat: -1,
      });
    }
  }
}
