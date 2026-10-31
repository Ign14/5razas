import { describe, expect, it } from 'vitest';
import { mergeBindings, rebind } from '../../src/core/input/bindings.ts';

const defaults = { power1: ['ONE'], dodge: ['SPACE'], moveUp: ['W', 'UP'], menu: ['ESC'] };

describe('teclas configurables', () => {
  it('reasigna la tecla principal conservando las alternativas', () => {
    const r = rebind(defaults, 'moveUp', 'I');
    expect(r).toEqual({ ok: true, bindings: { ...defaults, moveUp: ['I', 'UP'] } });
  });

  it('rechaza teclas ya usadas por otra acción, Esc y acciones desconocidas', () => {
    expect(rebind(defaults, 'power1', 'SPACE')).toEqual({ ok: false, reason: 'conflict', conflictWith: 'dodge' });
    expect(rebind(defaults, 'power1', 'ESC')).toEqual({ ok: false, reason: 'reserved' });
    expect(rebind(defaults, 'nada', 'Z')).toEqual({ ok: false, reason: 'unknown-action' });
    // Reasignar la misma tecla a su acción no es un conflicto.
    expect(rebind(defaults, 'power1', 'ONE').ok).toBe(true);
  });

  it('combina configuraciones guardadas con las predeterminadas', () => {
    const known = (k: string) => ['ONE', 'TWO', 'SPACE', 'W', 'UP', 'ESC', 'Z'].includes(k);
    const merged = mergeBindings(defaults, { power1: ['TWO'], dodge: ['TECLA_INEXISTENTE'], extra: ['Z'] }, known);
    expect(merged).toEqual({ ...defaults, power1: ['TWO'] });
    expect(mergeBindings(defaults, null, known)).toBe(defaults);
  });
});
