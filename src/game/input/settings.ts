import Phaser from 'phaser';
import { mergeBindings } from '../../core/input/bindings.ts';
import { parseBindings, type Bindings } from './playerInput.ts';

/** Configuración del usuario (GAME_DESIGN §15), independiente de la partida guardada. */
export interface UserSettings {
  readonly bindings: Bindings;
  readonly showPerf: boolean;
}

export const REGISTRY_SETTINGS = 'settings';

const known = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
export const isKnownKey = (k: string) => k in known;

export function defaultSettings(controlsRaw: unknown): UserSettings {
  return { bindings: parseBindings(controlsRaw), showPerf: false };
}

/** Lee una configuración guardada, tolerando datos antiguos o incompletos. */
export function readSettings(raw: unknown, defaults: UserSettings): UserSettings {
  if (typeof raw !== 'object' || raw === null) return defaults;
  const r = raw as Record<string, unknown>;
  return {
    bindings: mergeBindings(defaults.bindings, r['bindings'], isKnownKey),
    showPerf: typeof r['showPerf'] === 'boolean' ? r['showPerf'] : defaults.showPerf,
  };
}

const CODE_NAMES: Readonly<Record<string, string>> = {
  Space: 'SPACE', Enter: 'ENTER', Tab: 'TAB', Backspace: 'BACKSPACE', Escape: 'ESC',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT',
};
const DIGIT_WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

/** Nombre de tecla de Phaser (KeyCodes) a partir de `KeyboardEvent.code`, o null si no se admite. */
export function keyNameFromEvent(e: KeyboardEvent): string | null {
  const c = e.code;
  let name: string | undefined = CODE_NAMES[c];
  if (!name && /^Key[A-Z]$/.test(c)) name = c.slice(3);
  if (!name && /^Digit[0-9]$/.test(c)) name = DIGIT_WORDS[Number(c.slice(5))];
  if (!name && /^F([1-9]|1[0-2])$/.test(c)) name = c;
  return name && isKnownKey(name) ? name : null;
}

const DIGITS: Readonly<Record<string, string>> = {
  ZERO: '0', ONE: '1', TWO: '2', THREE: '3', FOUR: '4', FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9',
};
const NAMES: Readonly<Record<string, string>> = {
  SPACE: 'Espacio', ESC: 'Esc', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', SHIFT: 'Mayús', CTRL: 'Ctrl', TAB: 'Tab',
  ENTER: 'Enter', BACKSPACE: 'Retroceso',
};

/** Texto corto para mostrar una tecla en la interfaz. */
export function displayKey(name: string | undefined): string {
  if (!name) return '—';
  return DIGITS[name] ?? NAMES[name] ?? name;
}

/** Acciones configurables y su nombre en la interfaz (en orden de presentación). */
export const ACTION_LABELS: readonly (readonly [keyof Bindings, string])[] = [
  ['moveUp', 'Mover arriba'],
  ['moveDown', 'Mover abajo'],
  ['moveLeft', 'Mover a la izquierda'],
  ['moveRight', 'Mover a la derecha'],
  ['power1', 'Poder 1'],
  ['power2', 'Poder 2'],
  ['power3', 'Poder 3'],
  ['final', 'Habilidad final'],
  ['dodge', 'Evasión'],
  ['quick1', 'Consumible rápido 1'],
  ['quick2', 'Consumible rápido 2'],
  ['interact', 'Interactuar'],
  ['inventory', 'Inventario'],
  ['alchemy', 'Alquimia'],
  ['journal', 'Misiones'],
  ['map', 'Mapa'],
  ['perf', 'Indicador de rendimiento'],
];
