import type Phaser from 'phaser';
import type { CreatureInstance } from '../../core/simulation/worldSimulation.ts';

const W = 420;
const TEXT = { fontFamily: 'monospace', color: '#f2e6c8', stroke: '#000', strokeThickness: 4 } as const;

/** Barra de vida del jefe (parte superior central) con su fase y aviso de vulnerabilidad. */
export class BossBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private cx = 0;
  private y = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics();
    this.title = scene.add.text(0, 0, '', { ...TEXT, fontSize: '15px' }).setOrigin(0.5, 1);
    this.sub = scene.add.text(0, 0, '', { ...TEXT, fontSize: '11px', strokeThickness: 3 }).setOrigin(0.5, 0);
  }

  layout(centerX: number, top: number): void {
    this.cx = centerX;
    this.y = top;
    this.title.setPosition(centerX, top);
    this.sub.setPosition(centerX, top + 16);
  }

  /** `boss` = jefe en combate, o null para ocultar. */
  update(boss: CreatureInstance | null): void {
    const g = this.g.clear();
    const visible = boss !== null;
    this.title.setVisible(visible);
    this.sub.setVisible(visible);
    if (!boss) return;
    const phases = boss.def.boss?.phases ?? [];
    const phase = boss.boss?.phase ?? 0;
    const ratio = Math.max(0, boss.combatant.hp / boss.combatant.stats.life);
    this.title.setText(boss.def.name);
    const vulnerable = boss.combatant.statuses.has('vulnerable');
    this.sub.setText(`Fase ${phase + 1}/${phases.length}: ${phases[phase]?.name ?? ''}${vulnerable ? '   ¡VULNERABLE!' : ''}`);
    this.sub.setColor(vulnerable ? '#ffd84a' : '#f2e6c8');
    const x = this.cx - W / 2;
    const by = this.y + 4;
    g.fillStyle(0x000000, 0.75).fillRect(x - 2, by - 2, W + 4, 12);
    g.fillStyle(phase === 2 ? 0xff5a2a : 0xc0392b, 1).fillRect(x, by, W * ratio, 8);
    // Marcas de los umbrales de fase.
    g.fillStyle(0xf2e6c8, 0.8);
    for (const ph of phases.slice(1)) g.fillRect(x + W * ph.hpBelow - 1, by - 2, 2, 12);
  }
}
