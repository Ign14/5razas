import type Phaser from 'phaser';
import type { Combatant } from '../../core/combat/combatant.ts';

const W = 220;
const TEXT = { fontFamily: 'monospace', color: '#e6e1cf', stroke: '#000', strokeThickness: 3 } as const;

/** Marco superior izquierdo (GAME_DESIGN §12): retrato, nombre, nivel, vida, energía y XP. */
export class PlayerFrame {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly values: Phaser.GameObjects.Text;
  private readonly x: number;
  private readonly y: number;

  constructor(scene: Phaser.Scene, x: number, y: number, playerName: string, professionName: string) {
    this.x = x;
    this.y = y;
    this.g = scene.add.graphics();
    scene.add.text(x + 52, y + 2, `${playerName} · ${professionName}`, { ...TEXT, fontSize: '13px' });
    this.values = scene.add.text(x + 52, y + 46, '', { ...TEXT, fontSize: '11px', color: '#c9c3b0' });
  }

  update(c: Combatant, xp: number): void {
    const { x, y } = this;
    const g = this.g.clear();
    g.fillStyle(0x0b0d12, 0.8).fillRoundedRect(x, y, W + 52, 62, 6);
    g.lineStyle(2, 0xc9a85a, 0.9).strokeRoundedRect(x, y, W + 52, 62, 6);
    // Retrato provisional.
    g.fillStyle(0x2b201c, 1).fillRect(x + 6, y + 6, 40, 40);
    g.fillStyle(0xd9a77a, 1).fillRect(x + 16, y + 14, 20, 20);
    g.fillStyle(0xb0503a, 1).fillRect(x + 12, y + 34, 28, 12);
    g.fillStyle(0xe8c872, 1).fillRect(x + 6, y + 48, 40, 10);

    const bar = (by: number, ratio: number, color: number) => {
      g.fillStyle(0x000000, 0.8).fillRect(x + 52, by, W - 8, 8);
      g.fillStyle(color, 1).fillRect(x + 53, by + 1, Math.max(0, (W - 10) * ratio), 6);
    };
    bar(y + 22, c.hp / c.stats.life, 0xd94a3a);
    bar(y + 34, c.energy / c.stats.energy, 0x4aa8d9);
    this.values.setText(
      `Nv ${c.level}  Vida ${Math.ceil(c.hp)}/${c.stats.life}  Energía ${Math.floor(c.energy)}  XP ${xp}`,
    );
  }
}
