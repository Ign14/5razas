import Phaser from 'phaser';
import type { MoveInput } from '../../core/movement/direction.ts';
import { Issues } from '../../core/data/validate.ts';

const ACTIONS = ['moveUp', 'moveDown', 'moveLeft', 'moveRight'] as const;
type MoveAction = (typeof ACTIONS)[number];
export type MoveBindings = Readonly<Record<MoveAction, readonly string[]>>;

/** Valida las asignaciones de teclas contra los nombres de Phaser.Input.Keyboard.KeyCodes. */
export function parseMoveBindings(raw: unknown, source = 'data/controls.json'): MoveBindings {
  const issues = new Issues();
  const root = issues.record(raw, '$') ?? {};
  const known = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
  const result: Partial<Record<MoveAction, string[]>> = {};
  for (const action of ACTIONS) {
    const keys = issues.array(root[action], `$.${action}`) ?? [];
    if (keys.length === 0) issues.add(`$.${action}`, 'debe tener al menos una tecla');
    result[action] = keys.filter((k, i): k is string => {
      if (typeof k === 'string' && k in known) return true;
      issues.add(`$.${action}[${i}]`, `tecla desconocida "${String(k)}"`);
      return false;
    });
  }
  issues.throwIfAny(source);
  return result as MoveBindings;
}

/** Traduce el estado del teclado a acciones de movimiento abstractas. */
export class KeyboardMoveInput {
  private readonly keys: Record<MoveAction, Phaser.Input.Keyboard.Key[]>;

  constructor(keyboard: Phaser.Input.Keyboard.KeyboardPlugin, bindings: MoveBindings) {
    const add = (names: readonly string[]) => names.map((n) => keyboard.addKey(n, true, false));
    this.keys = {
      moveUp: add(bindings.moveUp),
      moveDown: add(bindings.moveDown),
      moveLeft: add(bindings.moveLeft),
      moveRight: add(bindings.moveRight),
    };
  }

  read(): MoveInput {
    const down = (a: MoveAction) => this.keys[a].some((k) => k.isDown);
    return { up: down('moveUp'), down: down('moveDown'), left: down('moveLeft'), right: down('moveRight') };
  }
}
