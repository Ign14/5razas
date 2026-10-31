import type { GameContent } from '../content.ts';
import type { GameSession } from '../session.ts';
import { PanelScene } from '../ui/panel.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

const W = 640;
const H = 460;
const STATUS_TEXT = { active: 'En curso', completed: 'Lista para entregar', 'turned-in': 'Completada' } as const;

/** Diario de misiones (tecla J, GAME_DESIGN §12). */
export class JournalScene extends PanelScene {
  private game$!: GameSession;
  private content!: GameContent;

  constructor() {
    super(SceneKeys.Journal);
  }

  init(data: { session: GameSession }): void {
    this.game$ = data.session;
  }

  create(): void {
    this.content = this.registry.get(REGISTRY_CONTENT) as GameContent;
    this.open(this.game$);
    this.render();
  }

  protected render(): void {
    const { x, y } = this.panel(W, H);
    this.text(x + 20, y + 14, 'Misiones', 16, '#e8c872');
    this.button(x + W - 110, y + 10, 'Cerrar (J)', () => { this.close(); }, 96);
    const quests = this.game$.sim.quests;
    let ty = y + 50;
    let shown = 0;
    for (const q of this.content.quests.all.values()) {
      const status = quests.status(q.id);
      if (status === 'locked' || status === 'available') continue;
      shown++;
      const color = status === 'turned-in' ? '#7a7f8c' : status === 'completed' ? '#9fe870' : '#e6e1cf';
      this.text(x + 20, ty, `${q.name} — ${STATUS_TEXT[status]}`, 13, color);
      ty += 20;
      if (status !== 'turned-in') {
        ty += this.text(x + 32, ty, q.description, 11, '#a9a596', W - 60).height + 4;
        for (const o of q.objectives) {
          this.text(x + 32, ty, `• ${o.description}: ${quests.progress(q.id, o.id)}/${o.count}`, 11, color);
          ty += 16;
        }
      }
      ty += 10;
    }
    if (shown === 0) this.text(x + 20, ty, 'Todavía no tienes misiones. Habla con el Vigía del Sendero (E).', 12, '#7a7f8c', W - 40);
  }
}
