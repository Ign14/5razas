import Phaser from 'phaser';
import { SceneKeys } from './keys.ts';

/** Pantalla inicial. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Menu);
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0d0f14');
    const title = this.add
      .text(width / 2, height * 0.38, '5RAZAS', {
        fontFamily: 'monospace',
        fontSize: '72px',
        color: '#e8c872',
        stroke: '#3a2a12',
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    const prompt = this.add
      .text(width / 2, height * 0.58, 'Presiona ENTER o haz clic para comenzar', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#d8d8d8',
      })
      .setOrigin(0.5);
    const footer = this.add
      .text(width / 2, height - 24, `v${__APP_VERSION__} · prototipo · arte provisional`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#7a7f8c',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      title.setPosition(size.width / 2, size.height * 0.38);
      prompt.setPosition(size.width / 2, size.height * 0.58);
      footer.setPosition(size.width / 2, size.height - 24);
    }, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', undefined, this));

    const start = () => this.scene.start(SceneKeys.Game);
    this.input.keyboard?.once('keydown-ENTER', start);
    this.input.once('pointerdown', start);
  }
}
