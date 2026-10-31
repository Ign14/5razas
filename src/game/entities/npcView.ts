import type Phaser from 'phaser';
import { cellToScreen, type IsoMetrics } from '../../core/math/iso.ts';
import type { NpcDefinition } from '../../core/narrative/dialogue.ts';
import type { QuestLog } from '../../core/quests/quests.ts';
import type { NpcPlacement } from '../../core/world/worldMap.ts';
import { ENTITY_DEPTH_BIAS, sortedDepth } from '../rendering/depth.ts';
import { PLAYER_ORIGIN_Y } from '../rendering/placeholderTextures.ts';

const TEXT = { fontFamily: 'monospace', stroke: '#000', strokeThickness: 3 } as const;

/** PNJ con su nombre y un indicador de misión: "!" disponible, "?" lista para entregar. */
export class NpcView {
  private readonly marker: Phaser.GameObjects.Text;
  private readonly npc: NpcDefinition;

  constructor(scene: Phaser.Scene, placement: NpcPlacement, npc: NpcDefinition, iso: IsoMetrics) {
    this.npc = npc;
    const p = cellToScreen(placement.position, iso);
    const depth = sortedDepth(p.y) + ENTITY_DEPTH_BIAS;
    scene.add.image(p.x, p.y, npc.spriteAtlas).setOrigin(0.5, PLAYER_ORIGIN_Y).setDepth(depth);
    scene.add.text(p.x, p.y - 50, npc.name, { ...TEXT, fontSize: '11px', color: '#e8c872' }).setOrigin(0.5, 1).setDepth(depth + 0.2);
    this.marker = scene.add.text(p.x, p.y - 62, '', { ...TEXT, fontSize: '18px', color: '#ffd84a' }).setOrigin(0.5, 1).setDepth(depth + 0.2);
    scene.tweens.add({ targets: this.marker, y: p.y - 66, duration: 600, yoyo: true, repeat: -1 });
  }

  sync(quests: QuestLog): void {
    let mark = '';
    for (const rule of this.npc.dialogue) {
      if (!rule.when) continue;
      const status = quests.status(rule.when.quest);
      if (status === 'completed') {
        mark = '?';
        break;
      }
      if (status === 'available') mark = '!';
    }
    this.marker.setText(mark);
  }
}
