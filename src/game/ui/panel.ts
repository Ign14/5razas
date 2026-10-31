import Phaser from 'phaser';

const TEXT = { fontFamily: 'monospace', color: '#e6e1cf' } as const;

/**
 * Base de las pantallas superpuestas (diálogo, diario, pausa): fondo atenuado, panel centrado,
 * textos y botones. Pausa la simulación mientras está abierta.
 */
export abstract class PanelScene extends Phaser.Scene {
  protected layer!: Phaser.GameObjects.Container;
  protected session!: { paused: boolean };

  protected open(session: { paused: boolean }): void {
    this.session = session;
    session.paused = true;
    this.layer = this.add.container(0, 0);
    this.scale.on('resize', () => { this.render(); }, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', undefined, this);
      session.paused = false;
    });
  }

  close(): void {
    this.session.paused = false;
    this.scene.stop();
  }

  protected abstract render(): void;

  /** Panel centrado; devuelve su esquina superior izquierda. */
  protected panel(w: number, h: number, dim = 0.55): { x: number; y: number } {
    this.layer.removeAll(true);
    const x = Math.round((this.scale.width - w) / 2);
    const y = Math.max(8, Math.round((this.scale.height - h) / 2));
    this.layer.add(this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, dim).setOrigin(0).setInteractive());
    this.layer.add(this.add.rectangle(x, y, w, h, 0x0b0d12, 0.96).setOrigin(0).setStrokeStyle(2, 0xc9a85a));
    return { x, y };
  }

  protected text(x: number, y: number, s: string, size = 12, color = '#e6e1cf', wrap = 0): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, { ...TEXT, fontSize: `${size}px`, color, lineSpacing: 3 });
    if (wrap > 0) t.setWordWrapWidth(wrap);
    this.layer.add(t);
    return t;
  }

  protected button(x: number, y: number, label: string, onClick: () => void, w = 160, h = 26): Phaser.GameObjects.Rectangle {
    const r = this.add.rectangle(x, y, w, h, 0x2a3140).setOrigin(0).setStrokeStyle(1, 0xc9a85a);
    r.setInteractive({ useHandCursor: true })
      .on('pointerover', () => r.setFillStyle(0x3a4458))
      .on('pointerout', () => r.setFillStyle(0x2a3140))
      .on('pointerdown', onClick);
    this.layer.add(r);
    this.text(x + 10, y + (h - 14) / 2, label, 12);
    return r;
  }
}
