import { rebind } from '../../core/input/bindings.ts';
import type { GameContent } from '../content.ts';
import type { Bindings } from '../input/playerInput.ts';
import {
  ACTION_LABELS,
  defaultSettings,
  displayKey,
  keyNameFromEvent,
  REGISTRY_SETTINGS,
  type UserSettings,
} from '../input/settings.ts';
import { IndexedDbSaveStorage } from '../persistence/indexedDbStorage.ts';
import { PanelScene } from '../ui/panel.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

const W = 560;
const ROW = 22;

/** Opciones: teclas configurables e indicador de rendimiento. Se aplican y guardan al instante. */
export class OptionsScene extends PanelScene {
  private settings!: UserSettings;
  private waitingFor: keyof Bindings | null = null;
  private message = '';

  constructor() {
    super(SceneKeys.Options);
  }

  init(data: { session: { paused: boolean } }): void {
    this.session = data.session;
    this.waitingFor = null;
    this.message = '';
  }

  create(): void {
    this.settings = this.registry.get(REGISTRY_SETTINGS) as UserSettings;
    this.open(this.session);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { this.onKey(e); });
    this.render();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.waitingFor) return;
    const action = this.waitingFor;
    this.waitingFor = null;
    const key = keyNameFromEvent(e);
    if (!key) {
      this.message = 'Tecla no admitida.';
    } else {
      const r = rebind(this.settings.bindings, action, key);
      if (r.ok) {
        this.apply({ ...this.settings, bindings: r.bindings });
        this.message = `${this.label(action)}: ${displayKey(key)}`;
      } else if (r.reason === 'conflict') {
        this.message = `${displayKey(key)} ya se usa para «${this.label(r.conflictWith)}».`;
      } else {
        this.message = r.reason === 'reserved' ? 'Esc está reservada para el menú.' : 'Acción desconocida.';
      }
    }
    this.render();
  }

  private label(action: string): string {
    return ACTION_LABELS.find(([a]) => a === action)?.[1] ?? action;
  }

  /** Aplica (vía el registro, que escuchan el juego y el HUD) y guarda la configuración. */
  private apply(settings: UserSettings): void {
    this.settings = settings;
    this.registry.set(REGISTRY_SETTINGS, settings);
    void new IndexedDbSaveStorage().saveSettings(settings).catch((err: unknown) => {
      console.error(err);
      this.message = 'No se pudo guardar la configuración.';
    });
  }

  protected render(): void {
    const h = 120 + ACTION_LABELS.length * ROW + 40;
    const { x, y } = this.panel(W, h, 0.7);
    this.text(x + 20, y + 14, 'Opciones — Controles', 16, '#e8c872');
    this.button(x + W - 110, y + 10, 'Cerrar (Esc)', () => { this.close(); }, 96);
    let ty = y + 46;
    for (const [action, label] of ACTION_LABELS) {
      const keys = this.settings.bindings[action];
      const waiting = this.waitingFor === action;
      this.text(x + 20, ty + 4, label, 12);
      this.text(x + 250, ty + 4, waiting ? 'Pulsa una tecla…' : keys.map(displayKey).join(' / '), 12, waiting ? '#ffd84a' : '#9fe870');
      this.button(x + W - 120, ty, 'Cambiar', () => {
        this.waitingFor = action;
        this.message = '';
        this.render();
      }, 100, ROW - 2);
      ty += ROW;
    }
    ty += 10;
    this.button(x + 20, ty, `Indicador de rendimiento: ${this.settings.showPerf ? 'Sí' : 'No'}`, () => {
      this.apply({ ...this.settings, showPerf: !this.settings.showPerf });
      this.render();
    }, 260);
    this.button(x + 290, ty, 'Restaurar predeterminados', () => {
      const content = this.registry.get(REGISTRY_CONTENT) as GameContent;
      this.apply(defaultSettings(content.controlsRaw));
      this.message = 'Controles restaurados.';
      this.render();
    }, 250);
    this.text(x + 20, ty + 34, this.message || 'El ataque básico usa el clic izquierdo. Esc está reservada.', 11, this.message ? '#ffd84a' : '#7a7f8c');
  }
}
