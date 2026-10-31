import type Phaser from 'phaser';
import type { ItemCatalog, ItemDefinition, Rarity } from '../../core/items/itemCatalog.ts';

/** Iconos PROVISIONALES de 24 × 24 px generados por código a partir de `icon` en items.json. */
export const ICON_SIZE = 24;
export const itemIconKey = (itemId: string) => `ph-item-${itemId}`;

export const RARITY_COLORS: Readonly<Record<Rarity, number>> = {
  common: 0xb8b4a8,
  uncommon: 0x6fcf6a,
  rare: 0x5aa7f0,
  epic: 0xb06af0,
  legendary: 0xf0a83a,
};

export const RARITY_NAMES: Readonly<Record<Rarity, string>> = {
  common: 'Común',
  uncommon: 'Poco común',
  rare: 'Raro',
  epic: 'Épico',
  legendary: 'Legendario',
};

function shade(color: string, d: number): string {
  const n = parseInt(color.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + d));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function paint(ctx: CanvasRenderingContext2D, item: ItemDefinition): void {
  const { shape, color } = item.icon;
  const px = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const dark = shade(color, -45);
  const light = shade(color, 40);
  switch (shape) {
    case 'potion':
      px(10, 3, 4, 4, '#c9c3b0');
      px(7, 7, 10, 13, dark);
      px(8, 8, 8, 11, color);
      px(9, 9, 2, 5, light);
      break;
    case 'blade':
      for (let i = 0; i < 13; i++) px(5 + i, 17 - i, 3, 2, i < 3 ? dark : light);
      px(3, 17, 6, 2, '#5b3b22');
      px(4, 19, 2, 3, '#5b3b22');
      break;
    case 'helm':
      px(5, 6, 14, 10, dark);
      px(6, 7, 12, 8, color);
      px(7, 11, 10, 2, '#1a1414');
      px(8, 8, 3, 2, light);
      break;
    case 'chest':
      px(4, 5, 16, 15, dark);
      px(5, 6, 14, 13, color);
      px(9, 6, 6, 3, dark);
      px(7, 9, 3, 6, light);
      break;
    case 'legs':
      px(6, 4, 12, 5, dark);
      px(6, 9, 5, 12, color);
      px(13, 9, 5, 12, color);
      px(7, 10, 2, 6, light);
      break;
    case 'boots':
      px(5, 6, 5, 10, color);
      px(14, 6, 5, 10, color);
      px(3, 15, 8, 5, dark);
      px(13, 15, 8, 5, dark);
      break;
    case 'amulet':
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI;
        px(12 + Math.round(Math.cos(t) * 7), 4 + Math.round(Math.sin(t) * 4), 1, 1, '#d9c27a');
      }
      px(8, 10, 8, 8, dark);
      px(9, 11, 6, 6, color);
      px(10, 12, 2, 2, light);
      break;
    case 'shard':
      for (let i = 0; i < 14; i++) px(11 - Math.floor(i / 4), 4 + i, 2 + Math.floor(i / 4), 1, i < 7 ? light : color);
      break;
    case 'dust':
      for (const [x, y] of [[8, 12], [12, 9], [15, 14], [10, 16], [14, 18], [6, 17], [17, 10]] as const) px(x, y, 3, 3, color);
      px(11, 13, 4, 4, light);
      break;
    case 'leaf':
      for (let y = 0; y < 14; y++) {
        const w = Math.round(Math.sin((y / 14) * Math.PI) * 6);
        px(12 - w, 4 + y, w * 2 + 1, 1, y < 7 ? light : color);
      }
      px(11, 4, 1, 16, dark);
      break;
    case 'root':
      px(10, 3, 5, 6, color);
      for (let i = 0; i < 12; i++) px(11 + Math.round(Math.sin(i / 2) * 2), 8 + i, 2, 1, dark);
      px(7, 13, 4, 1, dark);
      px(14, 15, 4, 1, dark);
      px(11, 4, 2, 2, light);
      break;
    case 'flower':
      px(11, 12, 2, 9, '#4c7a2e');
      for (const [x, y] of [[8, 6], [14, 6], [8, 11], [14, 11], [11, 3]] as const) px(x, y, 4, 4, color);
      px(11, 8, 4, 4, light);
      break;
    case 'mushroom':
      px(10, 12, 5, 8, '#e6dcc0');
      px(5, 6, 15, 6, dark);
      px(6, 5, 13, 6, color);
      px(8, 6, 2, 2, light);
      px(14, 7, 2, 2, light);
      break;
    case 'seed':
      for (const [x, y] of [[7, 10], [12, 7], [15, 12], [10, 15]] as const) {
        px(x, y, 4, 5, dark);
        px(x + 1, y, 2, 4, color);
      }
      px(13, 4, 1, 4, light);
      break;
    case 'sap':
      px(9, 4, 6, 4, light);
      px(7, 8, 10, 10, dark);
      px(8, 9, 8, 8, color);
      px(9, 10, 2, 3, light);
      break;
    case 'spore':
      for (const [x, y, r] of [[8, 9, 3], [15, 8, 2], [13, 15, 4], [7, 16, 2]] as const) {
        px(x - r, y - r + 1, r * 2, r * 2 - 2, color);
        px(x - r + 1, y - r, r * 2 - 2, r * 2, dark);
      }
      break;
    case 'meat':
      px(5, 8, 12, 9, dark);
      px(6, 9, 10, 7, color);
      px(16, 11, 5, 3, '#e6dcc0');
      px(8, 10, 3, 2, light);
      break;
    case 'hide':
      px(4, 5, 16, 14, dark);
      px(5, 6, 14, 12, color);
      px(8, 9, 3, 2, light);
      px(13, 13, 3, 2, light);
      break;
    case 'feather':
      for (let i = 0; i < 14; i++) px(6 + i, 18 - i, 1, 1, dark);
      for (let i = 2; i < 13; i++) px(7 + i, 18 - i - 3, 3, 3, i % 3 === 0 ? light : color);
      break;
  }
}

export function createItemIcons(scene: Phaser.Scene, items: ItemCatalog): void {
  for (const item of items.all.values()) {
    const key = itemIconKey(item.id);
    if (scene.textures.exists(key)) continue;
    const canvas = scene.textures.createCanvas(key, ICON_SIZE, ICON_SIZE);
    if (!canvas) throw new Error(`No se pudo crear la textura ${key}`);
    paint(canvas.context, item);
    canvas.refresh();
  }
}
