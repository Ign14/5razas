import type { GameSession } from '../session.ts';
import { PanelScene } from '../ui/panel.ts';
import { SceneKeys } from './keys.ts';

/** Menú de pausa (Esc): continuar, guardar manualmente o volver al menú principal. */
export class PauseScene extends PanelScene {
  private game$!: GameSession;
  private status = '';

  constructor() {
    super(SceneKeys.Pause);
  }

  init(data: { session: GameSession }): void {
    this.game$ = data.session;
    this.status = '';
  }

  create(): void {
    this.open(this.game$);
    this.render();
  }

  protected render(): void {
    const { x, y } = this.panel(300, 266);
    this.text(x + 20, y + 16, 'Pausa', 18, '#e8c872');
    this.button(x + 20, y + 56, 'Continuar', () => { this.close(); }, 260);
    this.button(x + 20, y + 92, 'Guardar partida', () => {
      this.status = 'Guardando…';
      this.render();
      void this.game$.save('manual').then((ok) => {
        this.status = ok ? 'Partida guardada.' : 'No se pudo guardar.';
        if (this.scene.isActive()) this.render();
      });
    }, 260);
    this.button(x + 20, y + 128, 'Opciones', () => {
      this.close();
      this.scene.launch(SceneKeys.Options, { session: this.game$ });
    }, 260);
    this.button(x + 20, y + 164, 'Salir al menú principal', () => {
      this.close();
      this.scene.stop(SceneKeys.Game);
      this.scene.start(SceneKeys.Menu);
    }, 260);
    if (this.status) this.text(x + 20, y + 206, this.status, 12, '#9fe870');
    this.text(x + 20, y + 232, 'El juego también se guarda automáticamente.', 10, '#7a7f8c');
  }
}
