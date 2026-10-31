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
