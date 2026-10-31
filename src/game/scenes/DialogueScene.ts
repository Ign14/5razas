import type { GameContent } from '../content.ts';
import type { GameSession } from '../session.ts';
import { PanelScene } from '../ui/panel.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

const W = 640;

/** Conversación con un PNJ. Las opciones se eligen con clic o con las teclas 1–4. */
export class DialogueScene extends PanelScene {
  private game$!: GameSession;
  private content!: GameContent;
  private dialogueId = '';

  constructor() {
    super(SceneKeys.Dialogue);
  }

  init(data: { session: GameSession; dialogueId: string }): void {
    this.game$ = data.session;
    this.dialogueId = data.dialogueId;
  }

  create(): void {
    this.content = this.registry.get(REGISTRY_CONTENT) as GameContent;
    this.open(this.game$);
    for (const [i, key] of ['ONE', 'TWO', 'THREE', 'FOUR'].entries()) {
      this.input.keyboard?.on(`keydown-${key}`, () => { this.choose(i); });
    }
    this.render();
  }

  private choose(index: number): void {
    const node = this.content.narrative.dialogues.get(this.dialogueId);
    if (!node || index >= node.options.length) return;
    const next = this.game$.sim.chooseDialogueOption(this.dialogueId, index);
    this.game$.flush();
    if (next === null) {
      this.close();
      return;
    }
    this.dialogueId = next;
    this.render();
  }

  protected render(): void {
    const node = this.content.narrative.dialogues.get(this.dialogueId);
    if (!node) {
      this.close();
      return;
    }
    const height = 120 + node.lines.length * 38 + node.options.length * 32;
    const { x, y } = this.panel(W, height, 0.35);
    this.text(x + 20, y + 14, node.speaker, 15, '#e8c872');
    let ty = y + 44;
    for (const line of node.lines) {
      const t = this.text(x + 20, ty, line, 13, '#e6e1cf', W - 40);
      ty += t.height + 10;
    }
    ty += 6;
    node.options.forEach((o, i) => {
      this.button(x + 20, ty, `${i + 1}. ${o.text}`, () => { this.choose(i); }, W - 40);
      ty += 32;
    });
  }
}
