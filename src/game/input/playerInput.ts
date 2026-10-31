import Phaser from 'phaser';
import { Issues } from '../../core/data/validate.ts';
import { screenToCell } from '../../core/math/iso.ts';
import { sub, type Vec2 } from '../../core/math/vector.ts';
import { intentFromInput } from '../../core/movement/direction.ts';
import type { ActionSlot } from '../../core/professions/profession.ts';
import type { PlayerCommand } from '../../core/simulation/worldSimulation.ts';

const MOVE_ACTIONS = ['moveUp', 'moveDown', 'moveLeft', 'moveRight'] as const;
/** Acciones activadas por teclado; el ataque básico se activa con el clic izquierdo. */
const KEY_ACTIONS = ['power1', 'power2', 'power3', 'final', 'dodge'] as const satisfies readonly ActionSlot[];
/** Consumibles (Q, F), inventario (I), interacción (E), alquimia (K), diario (J) y menú (Esc). */
const OTHER_ACTIONS = ['quick1', 'quick2', 'inventory', 'interact', 'alchemy', 'journal', 'menu'] as const;
type BindingName = (typeof MOVE_ACTIONS)[number] | (typeof KEY_ACTIONS)[number] | (typeof OTHER_ACTIONS)[number];
export type Bindings = Readonly<Record<BindingName, readonly string[]>>;

/** Valida las asignaciones contra los nombres de Phaser.Input.Keyboard.KeyCodes. */
export function parseBindings(raw: unknown, source = 'data/controls.json'): Bindings {
  const issues = new Issues();
  const root = issues.record(raw, '$') ?? {};
  const known = Phaser.Input.Keyboard.KeyCodes as unknown as Record<string, number>;
  const result: Partial<Record<BindingName, string[]>> = {};
  for (const action of [...MOVE_ACTIONS, ...KEY_ACTIONS, ...OTHER_ACTIONS]) {
    const keys = issues.array(root[action], `$.${action}`) ?? [];
    if (keys.length === 0) issues.add(`$.${action}`, 'debe tener al menos una tecla');
    result[action] = keys.filter((k, i): k is string => {
      if (typeof k === 'string' && k in known) return true;
      issues.add(`$.${action}[${i}]`, `tecla desconocida "${String(k)}"`);
      return false;
    });
  }
  issues.throwIfAny(source);
  return result as Bindings;
}

/** Traduce teclado y ratón a un PlayerCommand por frame. */
export class PlayerInput {
  private readonly keys: Record<BindingName, Phaser.Input.Keyboard.Key[]>;
  private readonly scene: Phaser.Scene;
  /** Clic recibido desde el último fotograma (un clic corto puede empezar y terminar entre dos lecturas). */
  private clickQueued = false;

  constructor(scene: Phaser.Scene, bindings: Bindings) {
    this.scene = scene;
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('El teclado no está disponible');
    const keys: Partial<Record<BindingName, Phaser.Input.Keyboard.Key[]>> = {};
    for (const [name, list] of Object.entries(bindings) as [BindingName, readonly string[]][]) {
      keys[name] = list.map((k) => keyboard.addKey(k, true, false));
    }
    this.keys = keys as Record<BindingName, Phaser.Input.Keyboard.Key[]>;
    scene.input.mouse?.disableContextMenu();
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.clickQueued = true;
    });
  }

  private down(name: BindingName): boolean {
    return this.keys[name].some((k) => k.isDown);
  }

  private justDown(name: BindingName): boolean {
    return this.keys[name].some((k) => Phaser.Input.Keyboard.JustDown(k));
  }

  /** `playerCell` es la posición del jugador en celdas, para calcular el apuntado hacia el cursor. */
  read(playerCell: Vec2): PlayerCommand {
    const move = intentFromInput({
      up: this.down('moveUp'),
      down: this.down('moveDown'),
      left: this.down('moveLeft'),
      right: this.down('moveRight'),
    });
    const pointer = this.scene.input.activePointer;
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const aim = sub(screenToCell({ x: world.x, y: world.y }), playerCell);

    let action: ActionSlot | null = null;
    for (const slot of KEY_ACTIONS) {
      if (this.justDown(slot)) {
        action = slot;
        break;
      }
    }
    let pressed = action !== null;
    if (!action && (pointer.leftButtonDown() || this.clickQueued)) {
      action = 'basic';
      pressed = this.clickQueued;
    }
    this.clickQueued = false;
    const quickSlot = this.justDown('quick1') ? 0 : this.justDown('quick2') ? 1 : null;
    return { move, aim, action, pressed, quickSlot, interact: this.justDown('interact') };
  }

  /** Pantalla superpuesta solicitada en este fotograma (una pulsación por tecla). */
  overlayPressed(): 'inventory' | 'alchemy' | 'journal' | 'menu' | null {
    for (const k of ['menu', 'inventory', 'alchemy', 'journal'] as const) if (this.justDown(k)) return k;
    return null;
  }
}
