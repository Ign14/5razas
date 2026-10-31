import { describe, expect, it } from 'vitest';
import type { AbilityDefinition } from '../../src/core/combat/abilities.ts';
import { CombatWorld, predictArea } from '../../src/core/combat/combatWorld.ts';
import { abilities, baseStats, fixedRng, makeCombatant, openField, statuses } from './helpers.ts';

/** RNG alto: sin críticos, sin evasión, sin estados probabilísticos (salvo chance 1). */
const NO_LUCK = fixedRng(0.999);

function setup(rng = NO_LUCK) {
  const world = new CombatWorld(openField, statuses, rng);
  const hero = makeCombatant({
    id: 'hero',
    team: 'player',
    position: { x: 50, y: 50 },
    stats: { ...baseStats, attack: 20, power: 20 },
    poise: Infinity,
    energyRegen: 0,
  });
  const foe = makeCombatant({ id: 'foe', position: { x: 51, y: 50 } });
  world.add(hero);
  world.add(foe);
  return { world, hero, foe };
}

const strike = abilities.get('guardian-strike');
const run = (world: CombatWorld, seconds: number, step = 1 / 60) => {
  for (let t = 0; t < seconds; t += step) world.update(step);
};
const damageTo = (events: ReturnType<CombatWorld['drainEvents']>, id: string) =>
  events.filter((e) => e.type === 'damage' && e.targetId === id).reduce((s, e) => s + (e.type === 'damage' ? e.amount : 0), 0);

describe('CombatWorld — uso de habilidades', () => {
  it('el ataque básico impacta tras la preparación y respeta la recuperación', () => {
    const { world, foe } = setup();
    expect(world.useAbility('hero', strike, { x: 1, y: 0 })).toEqual({ ok: true });
    expect(foe.hp).toBe(100);
    run(world, strike.windup + 0.02);
    expect(foe.hp).toBe(80);
    expect(world.useAbility('hero', strike, { x: 1, y: 0 })).toEqual({ ok: false, reason: 'cooldown' });
    run(world, strike.cooldown);
    expect(world.useAbility('hero', strike, { x: 1, y: 0 }).ok).toBe(true);
  });

  it('no golpea en la dirección contraria', () => {
    const { world, foe } = setup();
    world.useAbility('hero', strike, { x: -1, y: 0 });
    run(world, 0.2);
    expect(foe.hp).toBe(100);
  });

  it('consume energía y rechaza si no alcanza; bloqueo por nivel', () => {
    const { world, hero } = setup();
    const whirl = abilities.get('guardian-whirl');
    hero.energy = whirl.energyCost - 1;
    expect(world.useAbility('hero', whirl, { x: 1, y: 0 })).toEqual({ ok: false, reason: 'energy' });
    hero.energy = 100;
    expect(world.useAbility('hero', whirl, { x: 1, y: 0 }).ok).toBe(true);
    expect(hero.energy).toBe(100 - whirl.energyCost);
    const future: AbilityDefinition = { ...strike, id: 'x', unlockLevel: 5 };
    run(world, 1);
    expect(world.useAbility('hero', future, { x: 1, y: 0 })).toEqual({ ok: false, reason: 'locked' });
  });

  it('la cadencia reduce la recuperación del ataque básico', () => {
    const { world, hero } = setup();
    hero.stats = { ...hero.stats, attackRate: 2 };
    world.useAbility('hero', strike, { x: 1, y: 0 });
    expect(hero.cooldownRemaining(strike.id, world.time)).toBeCloseTo(strike.cooldown / 2);
  });
});

describe('CombatWorld — mecánicas', () => {
  it('invulnerabilidad breve tras recibir daño', () => {
    // El atacante golpea dos veces seguidas a un héroe con 1 s de invulnerabilidad.
    const world2 = new CombatWorld(openField, statuses, NO_LUCK);
    const hero = makeCombatant({ id: 'hero', team: 'player', invulnerabilityOnHit: 1, position: { x: 50, y: 50 } });
    const attacker = makeCombatant({ id: 'a', position: { x: 51, y: 50 }, stats: { ...baseStats, attack: 10 } });
    world2.add(hero);
    world2.add(attacker);
    const quick: AbilityDefinition = { ...strike, windup: 0, cooldown: 0 };
    world2.useAbility('a', quick, { x: -1, y: 0 });
    world2.update(0.01);
    const afterFirst = hero.hp;
    expect(afterFirst).toBeLessThan(100);
    world2.useAbility('a', quick, { x: -1, y: 0 });
    world2.update(0.01);
    expect(hero.hp).toBe(afterFirst);
    run(world2, 1.05);
    world2.useAbility('a', quick, { x: -1, y: 0 });
    world2.update(0.01);
    expect(hero.hp).toBeLessThan(afterFirst);
  });

  it('retroceso aleja al objetivo e interrumpe su ataque en preparación', () => {
    const { world, foe } = setup();
    const lash = abilities.get('thorn-lash');
    world.useAbility('foe', lash, { x: -1, y: 0 }); // preparación de 0,5 s
    world.useAbility('hero', strike, { x: 1, y: 0 });
    run(world, 0.3);
    const events = world.drainEvents();
    expect(events.some((e) => e.type === 'interrupted' && e.targetId === 'foe')).toBe(true);
    expect(foe.position.x).toBeGreaterThan(51.2);
    run(world, 0.5);
    // El héroe nunca recibió el latigazo cancelado.
    expect(world.get('hero')?.hp).toBe(100);
  });

  it('el aplomo evita que golpes débiles interrumpan', () => {
    const { world, foe } = setup();
    const sturdy = makeCombatant({ id: 'sturdy', position: { x: 50, y: 51 }, poise: 0.6 });
    world.add(sturdy);
    const lash = abilities.get('thorn-lash');
    world.useAbility('sturdy', lash, { x: 0, y: -1 });
    world.useAbility('hero', strike, { x: 0, y: 1 }); // retroceso 0,3 < aplomo 0,6
    run(world, 0.2);
    expect(world.drainEvents().some((e) => e.type === 'interrupted')).toBe(false);
    run(world, 0.4);
    expect(world.get('hero')?.hp).toBeLessThan(100);
    expect(foe.alive).toBe(true);
  });

  it('estados: quemadura hace daño periódico; la resistencia acorta la duración', () => {
    const world = new CombatWorld(openField, statuses, fixedRng(0));
    const hero = makeCombatant({ id: 'hero', team: 'player' });
    const tough = makeCombatant({ id: 'tough', team: 'player', position: { x: 50, y: 52 }, stats: { ...baseStats, resistance: 100 } });
    const moth = makeCombatant({ id: 'moth', position: { x: 52, y: 51 }, stats: { ...baseStats, attack: 0, crit: 0 } });
    world.add(hero);
    world.add(tough);
    world.add(moth);
    // Aplicar quemadura directamente con una habilidad de prueba de área circular y probabilidad 1.
    const ignite: AbilityDefinition = {
      ...strike,
      id: 'ignite',
      area: { shape: 'circle', radius: 5 },
      windup: 0,
      knockback: 0,
      applyStatus: { statusId: 'burn', target: 'hit', chance: 1 },
    };
    world.useAbility('moth', ignite, { x: -1, y: 0 });
    world.update(0.01);
    expect(hero.statuses.get('burn')?.remaining).toBeCloseTo(3 - 0.0, 1);
    expect(tough.statuses.get('burn')?.remaining).toBeCloseTo(1.5, 1);
    const hpAfterHit = hero.hp;
    world.drainEvents();
    run(world, 3.1, 0.05);
    const dot = world.drainEvents().filter((e) => e.type === 'damage' && e.targetId === 'hero' && e.statusId === 'burn');
    expect(dot.length).toBe(6); // 3 s / 0,5 s
    expect(hero.hp).toBe(hpAfterHit - 6 * 3);
    expect(hero.statuses.has('burn')).toBe(false);
  });

  it('ralentización reduce la velocidad y protección reduce el daño a la mitad', () => {
    const { world, hero, foe } = setup();
    const ward = abilities.get('guardian-ward');
    world.useAbility('hero', ward, { x: 1, y: 0 });
    run(world, 0.2);
    expect(hero.damageTakenMultiplier).toBe(0.5);
    const quick: AbilityDefinition = { ...strike, windup: 0, cooldown: 0, knockback: 0 };
    world.useAbility('foe', quick, { x: -1, y: 0 });
    world.update(0.01);
    expect(100 - hero.hp).toBe(5); // 10 de ataque × 0,5
    const lash: AbilityDefinition = { ...abilities.get('thorn-lash'), windup: 0, knockback: 0, applyStatus: { statusId: 'slow', target: 'hit', chance: 1 } };
    hero.invulnerableUntil = 0;
    world.useAbility('foe', lash, { x: -1, y: 0 });
    world.update(0.01);
    expect(hero.speedMultiplier).toBeCloseTo(0.55);
    expect(foe.alive).toBe(true);
  });

  it('final: varios impactos sobre todos los enemigos del área', () => {
    const { world, hero, foe } = setup();
    const far = makeCombatant({ id: 'far', position: { x: 50, y: 52.5 } });
    world.add(far);
    const tempest = abilities.get('guardian-tempest');
    world.useAbility('hero', tempest, { x: 1, y: 0 });
    expect(hero.canAct(world.time)).toBe(false);
    run(world, tempest.windup + tempest.hitInterval * (tempest.hits - 1) + 0.05);
    const events = world.drainEvents();
    expect(events.filter((e) => e.type === 'damage' && e.targetId === 'foe')).toHaveLength(tempest.hits);
    expect(damageTo(events, 'far')).toBeGreaterThan(0);
    expect(foe.hp).toBeLessThan(100);
  });

  it('embestida: desplaza al lanzador y golpea en el recorrido', () => {
    const { world, hero, foe } = setup();
    foe.position = { x: 52, y: 50 };
    const charge = abilities.get('guardian-charge');
    world.useAbility('hero', charge, { x: 1, y: 0 });
    run(world, (charge.dash?.duration ?? 0) + 0.05);
    expect(hero.position.x).toBeCloseTo(50 + (charge.dash?.distance ?? 0), 1);
    expect(foe.hp).toBeLessThan(100);
  });

  it('evasión: invulnerable durante el desplazamiento', () => {
    const { world, hero } = setup();
    const dodge = abilities.get('guardian-dodge');
    world.useAbility('hero', dodge, { x: 0, y: 1 });
    expect(hero.isInvulnerable(world.time)).toBe(true);
    const quick: AbilityDefinition = { ...strike, windup: 0, cooldown: 0, area: { shape: 'circle', radius: 10 } };
    world.useAbility('foe', quick, { x: -1, y: 0 });
    world.update(0.01);
    expect(hero.hp).toBe(100);
    run(world, 0.3);
    expect(hero.isInvulnerable(world.time)).toBe(false);
    expect(hero.position.y).toBeGreaterThan(52);
  });

  it('muerte: emite evento con el responsable y deja de actuar', () => {
    const { world, foe } = setup();
    foe.hp = 5;
    world.useAbility('hero', strike, { x: 1, y: 0 });
    run(world, 0.2);
    const death = world.drainEvents().find((e) => e.type === 'death');
    expect(death).toEqual({ type: 'death', targetId: 'foe', killerId: 'hero' });
    expect(foe.alive).toBe(false);
    expect(world.useAbility('foe', strike, { x: -1, y: 0 })).toEqual({ ok: false, reason: 'dead' });
  });

  it('predictArea coincide con el área real de un dash completo', () => {
    const dive = abilities.get('ash-dive');
    const area = predictArea(dive, { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(area).toMatchObject({ shape: 'line', from: { x: 0, y: 0 }, length: 2.5 });
  });
});
