import type Phaser from 'phaser';
import type { QuestLog } from '../../core/quests/quests.ts';

const TEXT = { fontFamily: 'monospace', color: '#e6e1cf', stroke: '#000', strokeThickness: 3 } as const;

/** Objetivo de la misión activa en pantalla (GAME_DESIGN §12, lateral). */
export class QuestTracker {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add.text(0, 0, '', { ...TEXT, fontSize: '12px', lineSpacing: 3 });
  }

  layout(x: number, y: number): void {
    this.text.setPosition(x, y);
  }

  update(quests: QuestLog): void {
    const lines: string[] = [];
    for (const q of quests.active().slice(0, 2)) {
      const status = quests.status(q.id);
      lines.push(status === 'completed' ? `◆ ${q.name} — vuelve con el Vigía` : `◆ ${q.name}`);
      if (status === 'active') {
        for (const o of q.objectives) lines.push(`   ${o.description}: ${quests.progress(q.id, o.id)}/${o.count}`);
      }
    }
    if (lines.length === 0 && quests.status('senales-en-el-bosque') === 'available') lines.push('◆ Habla con el Vigía del Sendero (E)');
    this.text.setText(lines.join('\n'));
  }
}
