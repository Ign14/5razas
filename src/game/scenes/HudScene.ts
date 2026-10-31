import Phaser from 'phaser';
import type { GameSession } from '../session.ts';
import { Minimap } from '../ui/minimap.ts';
import { SceneKeys } from './keys.ts';

const MARGIN = 12;

/** HUD superpuesto, con cámara propia (no afectado por el seguimiento del mundo). */
export class HudScene extends Phaser.Scene {
  private session!: GameSession;
  private minimap!: Minimap;
  private sectorLabel!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.Hud);
  }

  init(data: { session: GameSession }): void {
    this.session = data.session;
  }

  create(): void {
    this.minimap = new Minimap(this, this.session);
    this.sectorLabel = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '13px', color: '#e6e1cf', stroke: '#000', strokeThickness: 3 })
      .setOrigin(1, 0);
    this.add.text(MARGIN, MARGIN, 'WASD: moverse', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#e6e1cf',
      stroke: '#000',
      strokeThickness: 3,
    });

    this.layout(this.scale.width);
    this.scale.on('resize', (size: Phaser.Structs.Size) => { this.layout(size.width); }, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', undefined, this);
      this.minimap.destroy();
    });
  }

  private layout(width: number): void {
    this.minimap.layout(width - MARGIN, MARGIN);
    this.sectorLabel.setPosition(width - MARGIN, MARGIN + this.minimap.height + 18);
  }

  override update(): void {
    this.minimap.update();
    const { position } = this.session.player;
    this.sectorLabel.setText(`${this.session.map.name}  (${Math.floor(position.x)}, ${Math.floor(position.y)})`);
  }
}
