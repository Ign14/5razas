import type Phaser from 'phaser';

const TEXT = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 3 } as const;
const MAX_LINES = 6;
const LIFETIME = 4;

interface Line {
  readonly text: Phaser.GameObjects.Text;
  readonly until: number;
}

/** Notificaciones relevantes en el lateral derecho (GAME_DESIGN §12): botín, XP, avisos. */
export class NotificationFeed {
  private readonly scene: Phaser.Scene;
  private lines: Line[] = [];
  private right = 0;
  private top = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  layout(right: number, top: number): void {
    this.right = right;
    this.top = top;
    this.reflow();
  }

  push(message: string, color: string, now: number): void {
    const text = this.scene.add.text(0, 0, message, { ...TEXT, fontSize: '12px', color }).setOrigin(1, 0);
    this.lines.unshift({ text, until: now + LIFETIME });
    while (this.lines.length > MAX_LINES) this.lines.pop()?.text.destroy();
    this.reflow();
  }

  update(now: number): void {
    const before = this.lines.length;
    this.lines = this.lines.filter((l) => {
      const left = l.until - now;
      if (left <= 0) {
        l.text.destroy();
        return false;
      }
      l.text.setAlpha(Math.min(1, left));
      return true;
    });
    if (this.lines.length !== before) this.reflow();
  }

  private reflow(): void {
    this.lines.forEach((l, i) => l.text.setPosition(this.right, this.top + i * 16));
  }
}
