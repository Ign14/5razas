import { describe, expect, it } from 'vitest';
import { combinationKey, combinedProperties, parseRecipeBook } from '../../src/core/alchemy/alchemy.ts';
import type { AbilityDefinition } from '../../src/core/combat/abilities.ts';
import { CombatWorld } from '../../src/core/combat/combatWorld.ts';
import type { DataValidationError } from '../../src/core/data/validate.ts';
import {
  validateContentReferences,
  WorldSimulation,
  type PlayerCommand,
  type SimEvent,
} from '../../src/core/simulation/worldSimulation.ts';
import { abilities, fixedRng, loadTestContent, makeCombatant, openField, statuses } from './helpers.ts';

const content = loadTestContent();
const IDLE: PlayerCommand = { move: { x: 0, y: 0 }, aim: null, action: null, pressed: false, quickSlot: null, interact: false };
const DT = 1 / 60;
const one = (itemId: string, quantity = 1) => ({ itemId, quantity });

function runSim(sim: WorldSimulation, seconds: number, cmd: (t: number) => PlayerCommand = () => IDLE): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += DT) events.push(...sim.update(DT, cmd(t)));
  return events;
}

describe('motor de recetas', () => {
  it('las cinco combinaciones del diseño (§10.4) existen como datos', () => {
    const r = content.recipes;
    expect(r.find([one('hoja-carmesi'), one('raiz-solar')])?.result.itemId).toBe('elixir-de-brasa');
    expect(r.find([one('flor-de-escarcha'), one('hongo-azul')])?.result.itemId).toBe('elixir-de-escarcha');
    expect(r.find([one('espora-umbria'), one('savia-gris')])?.result.itemId).toBe('elixir-umbrio');
    expect(r.find([one('semilla-del-viento'), one('hoja-ligera')])?.result.itemId).toBe('tonico-de-viento');
    expect(r.find([one('raiz-vital'), one('flor-dorada')])?.result.itemId).toBe('tonico-de-raiz');
  });

  it('el orden y la agrupación de los ingredientes no importan', () => {
    expect(combinationKey([one('b'), one('a'), one('b')])).toBe(combinationKey([one('b', 2), one('a')]));
    expect(content.recipes.find([one('raiz-solar'), one('hoja-carmesi')])?.id).toBe('elixir-de-brasa');
    expect(content.recipes.find([one('carne-silvestre'), one('carne-silvestre')])?.id).toBe('carne-asada');
    expect(content.recipes.find([one('hoja-carmesi'), one('hoja-carmesi')])).toBeNull();
  });

  it('rechaza recetas duplicadas, de un solo ingrediente o demasiado grandes', () => {
    const bad = {
      config: { maxUnits: 3, failedResult: one('x') },
      recipes: [
        { id: 'a', name: 'A', ingredients: [one('p'), one('q')], result: one('r'), discoveryXp: 1 },
        { id: 'b', name: 'B', ingredients: [one('q'), one('p')], result: one('s'), discoveryXp: 1 },
        { id: 'c', name: 'C', ingredients: [one('p')], result: one('s'), discoveryXp: 1 },
        { id: 'd', name: 'D', ingredients: [one('p', 4)], result: one('s'), discoveryXp: 1 },
      ],
    };
    try {
      parseRecipeBook(bad, 'bad');
      expect.unreachable();
    } catch (e) {
      const msg = (e as DataValidationError).issues.join('\n');
      expect(msg).toContain('la misma combinación ya produce "a"');
      expect(msg).toContain('al menos dos unidades');
      expect(msg).toContain('máximo de 3');
    }
  });

  it('suma las propiedades alquímicas como pista', () => {
    expect(combinedProperties([one('hoja-carmesi'), one('raiz-solar')], content.plants)).toEqual([
      { element: 'fire', potency: 3 },
      { element: 'vital', potency: 1 },
    ]);
    expect(combinedProperties([one('carne-silvestre')], content.plants)).toEqual([]);
  });

  it('las referencias de alquimia son válidas', () => {
    expect(validateContentReferences(content)).toEqual([]);
  });
});

describe('experimentar en la simulación', () => {
  it('descubrir una receta: consume ingredientes, produce el resultado, registra y da XP solo la primera vez', () => {
    const sim = new WorldSimulation(content, 1);
    sim.character.inventory.add('hoja-carmesi', 2);
    sim.character.inventory.add('raiz-solar', 2);
    const r = sim.experiment([one('hoja-carmesi'), one('raiz-solar')]);
    expect(r).toMatchObject({ ok: true, recipeId: 'elixir-de-brasa', itemId: 'elixir-de-brasa', firstDiscovery: true });
    expect(sim.character.inventory.count('hoja-carmesi')).toBe(1);
    expect(sim.character.inventory.count('elixir-de-brasa')).toBe(1);
    expect(sim.discoveries.has('elixir-de-brasa')).toBe(true);
    const xp = sim.xp;
    expect(xp).toBe(content.recipes.recipes.get('elixir-de-brasa')?.discoveryXp);
    expect(sim.experiment([one('raiz-solar'), one('hoja-carmesi')])).toMatchObject({ ok: true, firstDiscovery: false });
    expect(sim.xp).toBe(xp);
  });

  it('una combinación inválida consume los ingredientes y produce un resultado menor', () => {
    const sim = new WorldSimulation(content, 1);
    sim.character.inventory.add('hoja-carmesi', 2);
    const r = sim.experiment([one('hoja-carmesi', 2)]);
    expect(r).toMatchObject({ ok: true, recipeId: null, itemId: 'mezcla-turbia', firstDiscovery: false });
    expect(r.ok && r.properties).toEqual([{ element: 'fire', potency: 4 }]);
    expect(sim.character.inventory.count('hoja-carmesi')).toBe(0);
    expect(sim.discoveries.size).toBe(0);
  });

  it('valida cantidad, existencias y tipo de ingrediente sin consumir nada', () => {
    const sim = new WorldSimulation(content, 1);
    sim.character.inventory.add('hoja-carmesi', 1);
    expect(sim.experiment([one('hoja-carmesi')])).toEqual({ ok: false, reason: 'too-few' });
    expect(sim.experiment([one('hoja-carmesi', 5)])).toEqual({ ok: false, reason: 'too-many' });
    expect(sim.experiment([one('hoja-carmesi'), one('raiz-solar')])).toEqual({ ok: false, reason: 'missing-ingredients' });
    expect(sim.experiment([one('hoja-carmesi'), one('tonico-vital')])).toEqual({ ok: false, reason: 'invalid-ingredient' });
    expect(sim.character.inventory.count('hoja-carmesi')).toBe(1);
  });
});

describe('efectos alquímicos en el combate', () => {
  const strike = abilities.get('guardian-strike');
  const elements = content.elements;

  function duel(rng = fixedRng(0)) {
    const world = new CombatWorld(openField, statuses, rng, elements);
    const hero = makeCombatant({ id: 'hero', team: 'player', level: 10, poise: Infinity });
    const foe = makeCombatant({ id: 'foe', position: { x: 51, y: 50 }, stats: { ...hero.stats, life: 500 } });
    world.add(hero);
    world.add(foe);
    return { world, hero, foe };
  }

  it('una infusión de fuego hace que las habilidades compatibles apliquen quemadura', () => {
    const { world, hero, foe } = duel();
    hero.infusion = { elementId: 'fire', until: 60 };
    world.useAbility('hero', strike, { x: 1, y: 0 });
    for (let i = 0; i < 12; i++) world.update(DT);
    const events = world.drainEvents();
    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', element: 'fire' }));
    expect(foe.statuses.has('burn')).toBe(true);
  });

  it('sin infusión, o con habilidades no compatibles, no hay efecto elemental', () => {
    const { world, foe } = duel();
    world.useAbility('hero', strike, { x: 1, y: 0 });
    for (let i = 0; i < 12; i++) world.update(DT);
    expect(foe.statuses.size).toBe(0);

    const second = duel();
    second.hero.infusion = { elementId: 'fire', until: 60 };
    const incompatible: AbilityDefinition = { ...strike, id: 'plain', compatibleModifiers: [] };
    second.world.useAbility('hero', incompatible, { x: 1, y: 0 });
    for (let i = 0; i < 12; i++) second.world.update(DT);
    expect(second.foe.statuses.size).toBe(0);
  });

  it('la infusión caduca', () => {
    const { world, hero, foe } = duel();
    hero.infusion = { elementId: 'ice', until: 0.01 };
    for (let i = 0; i < 3; i++) world.update(DT);
    world.useAbility('hero', strike, { x: 1, y: 0 });
    for (let i = 0; i < 12; i++) world.update(DT);
    expect(foe.statuses.has('slow')).toBe(false);
  });

  it('el viento añade retroceso; la final incorpora el elemento activo (§6.2)', () => {
    const { world, hero, foe } = duel();
    hero.infusion = { elementId: 'wind', until: 60 };
    world.useAbility('hero', strike, { x: 1, y: 0 });
    for (let i = 0; i < 30; i++) world.update(DT);
    const pushedWithWind = foe.position.x - 51;
    const plain = duel();
    plain.world.useAbility('hero', strike, { x: 1, y: 0 });
    for (let i = 0; i < 30; i++) plain.world.update(DT);
    expect(pushedWithWind).toBeGreaterThan(plain.foe.position.x - 51 + 0.4);
    expect(abilities.get('guardian-tempest').compatibleModifiers).toContain('element');
  });

  it('usar un elixir activa la infusión; tónicos aplican celeridad y regeneración', () => {
    const sim = new WorldSimulation(content, 1);
    sim.character.inventory.add('elixir-de-brasa', 1);
    sim.character.inventory.add('tonico-de-viento', 1);
    sim.character.inventory.add('tonico-de-raiz', 1);
    expect(sim.useItem('elixir-de-brasa')).toEqual({ ok: true });
    expect(sim.player.activeElement(sim.time)).toBe('fire');
    expect(sim.drainEvents()).toContainEqual(expect.objectContaining({ type: 'infusion', elementId: 'fire' }));

    runSim(sim, 6.1); // recuperación compartida de consumibles
    expect(sim.useItem('tonico-de-viento')).toEqual({ ok: true });
    expect(sim.player.speedMultiplier).toBeCloseTo(1.3);

    runSim(sim, 6.1);
    sim.player.hp = 50;
    expect(sim.useItem('tonico-de-raiz')).toEqual({ ok: true });
    const events = runSim(sim, 3.05);
    expect(events.filter((e) => e.type === 'heal')).toHaveLength(3);
    expect(sim.player.hp).toBe(62);
  });

  it('preparaciones de alimento curan (carne asada) y se pueden fabricar con carne', () => {
    const sim = new WorldSimulation(content, 1);
    sim.character.inventory.add('carne-silvestre', 2);
    expect(sim.experiment([one('carne-silvestre', 2)])).toMatchObject({ ok: true, itemId: 'carne-asada' });
    sim.player.hp = 10;
    expect(sim.useItem('carne-asada')).toEqual({ ok: true });
    expect(sim.player.hp).toBe(70);
  });
});
