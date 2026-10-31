import Phaser from 'phaser';
import { AlchemyScene } from '../game/scenes/AlchemyScene.ts';
import { BootScene } from '../game/scenes/BootScene.ts';
import { GameScene } from '../game/scenes/GameScene.ts';
import { HudScene } from '../game/scenes/HudScene.ts';
import { InventoryScene } from '../game/scenes/InventoryScene.ts';
import { MenuScene } from '../game/scenes/MenuScene.ts';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0d0f14',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: 1280,
      height: 720,
    },
    fps: { target: 60 },
    scene: [BootScene, MenuScene, GameScene, HudScene, InventoryScene, AlchemyScene],
  };
}
