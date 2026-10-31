import { describe, expect, it } from 'vitest';
import { computeDamage } from '../../src/core/combat/damage.ts';
import { overlapsHurtbox } from '../../src/core/combat/hitShapes.ts';
import { applyModifiers } from '../../src/core/combat/stats.ts';
import { baseStats, fixedRng } from './helpers.ts';

describe('atributos y modificadores', () => {
  it('aplica primero sumas y luego multiplicaciones', () => {
    const s = applyModifiers(baseStats, [
      { stat: 'attack', op: 'mul', value: 2, source: 'a' },
      { stat: 'attack', op: 'add', value: 5, source: 'b' },
    ]);
    expect(s.attack).toBe(30);
  });

  it('respeta los límites (vida mínima 1, crítico máximo 0,95)', () => {
    const s = applyModifiers(baseStats, [
      { stat: 'life', op: 'add', value: -1000, source: 'x' },
      { stat: 'crit', op: 'add', value: 5, source: 'x' },
    ]);
    expect(s.life).toBe(1);
    expect(s.crit).toBe(0.95);
  });
});

describe('cálculo de daño', () => {
  const input = {
    attacker: { ...baseStats, attack: 20, power: 30 },
    defender: { ...baseStats, defense: 25 },
    multiplier: 1.5,
    damageTakenMultiplier: 1,
  };

  it('daño físico mitigado por defensa', () => {
    const r = computeDamage({ ...input, damageType: 'physical', rng: fixedRng(0.99) });
    expect(r).toEqual({ evaded: false, amount: Math.round(20 * 1.5 * (100 / 125)), crit: false });
  });

  it('el daño de poder ignora la mitad de la defensa', () => {
    const r = computeDamage({ ...input, damageType: 'power', rng: fixedRng(0.99) });
    expect(r.amount).toBe(Math.round(30 * 1.5 * (100 / 112.5)));
  });

  it('crítico multiplica por 1,5 y la protección reduce el daño', () => {
    const crit = computeDamage({
      ...input,
      attacker: { ...input.attacker, crit: 0.5 },
      damageType: 'physical',
      rng: fixedRng(0.3),
    });
    expect(crit.crit).toBe(true);
    expect(crit.amount).toBe(36);
    const protectedHit = computeDamage({ ...input, damageType: 'physical', damageTakenMultiplier: 0.5, rng: fixedRng(0.99) });
    expect(protectedHit.amount).toBe(12);
  });

  it('la evasión anula el impacto y el daño mínimo es 1', () => {
    const evaded = computeDamage({ ...input, defender: { ...baseStats, evasion: 0.5 }, damageType: 'physical', rng: fixedRng(0.1) });
    expect(evaded.evaded).toBe(true);
    const tiny = computeDamage({ ...input, attacker: { ...baseStats, attack: 0 }, damageType: 'physical', rng: fixedRng(0.99) });
    expect(tiny.amount).toBe(1);
  });
});

describe('hitboxes contra hurtboxes', () => {
  const origin = { x: 0, y: 0 };
  it('arco: alcanza enfrente, no detrás', () => {
    const arc = { shape: 'arc' as const, center: origin, dir: { x: 1, y: 0 }, radius: 1.5, halfAngle: Math.PI / 3 };
    expect(overlapsHurtbox(arc, { x: 1.2, y: 0 }, 0.3)).toBe(true);
    expect(overlapsHurtbox(arc, { x: -1.2, y: 0 }, 0.3)).toBe(false);
    expect(overlapsHurtbox(arc, { x: 2.1, y: 0 }, 0.3)).toBe(false);
    expect(overlapsHurtbox(arc, { x: 0.1, y: 0.1 }, 0.3)).toBe(true);
  });

  it('círculo y línea', () => {
    expect(overlapsHurtbox({ shape: 'circle', center: origin, radius: 2 }, { x: 0, y: 2.2 }, 0.3)).toBe(true);
    const line = { shape: 'line' as const, from: origin, dir: { x: 0, y: 1 }, length: 3, halfWidth: 0.5 };
    expect(overlapsHurtbox(line, { x: 0.6, y: 2 }, 0.2)).toBe(true);
    expect(overlapsHurtbox(line, { x: 1, y: 2 }, 0.2)).toBe(false);
    expect(overlapsHurtbox(line, { x: 0, y: 3.5 }, 0.2)).toBe(false);
  });
});
