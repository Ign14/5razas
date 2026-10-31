import Phaser from 'phaser';
import { createGameConfig } from './config/gameConfig.ts';

const game = new Phaser.Game(createGameConfig('game'));

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}
