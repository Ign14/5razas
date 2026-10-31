import type Phaser from 'phaser';
import { npcQuestIndicator, type NarrativeCatalog } from '../../core/narrative/dialogue.ts';
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

  update(quests: QuestLog, narrative: NarrativeCatalog): void {
    const lines: string[] = [];
    for (const q of quests.active().slice(0, 2)) {
      const status = quests.status(q.id);
      const giver = narrative.npcs.get(q.giver)?.name ?? q.giver;
      lines.push(status === 'completed' ? `◆ ${q.name} — entrega: ${giver} (E)` : `◆ ${q.name}`);
      if (status === 'active') {
        for (const o of q.objectives) lines.push(`   ${o.description}: ${quests.progress(q.id, o.id)}/${o.count}`);
      }
    }
    if (lines.length === 0) {
      const offering = [...narrative.npcs.values()].find((n) => npcQuestIndicator(n, quests) === '!');
      if (offering) lines.push(`◆ Conversa: ${offering.name} (E)`);
    }
    this.text.setText(lines.join('\n'));
  }
}
