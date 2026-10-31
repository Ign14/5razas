import { describe, expect, it } from 'vitest';
import { CreatureBrain } from '../../src/core/ai/creatureBrain.ts';
import type { CreatureBehavior } from '../../src/core/creatures/creatureCatalog.ts';
import type { DataValidationError } from '../../src/core/data/validate.ts';
import { parsePlantCatalog, plantGrowsAt, PlantField } from '../../src/core/ecosystem/plants.ts';
import { createRng } from '../../src/core/math/random.ts';
import {
  ACTIVE_RADIUS,
  INTERACT_RADIUS,
  validateContentReferences,
  WorldSimulation,
  type PlayerCommand,
  type SimEvent,
} from '../../src/core/simulation/worldSimulation.ts';
import { darknessAt, dayAt, hourAt, inHourRange } from '../../src/core/world/worldClock.ts';
import { loadTestContent, makeCombatant } from './helpers.ts';

const content = loadTestContent();
const IDLE: PlayerCommand = { move: { x: 0, y: 0 }, aim: null, action: null, pressed: false, quickSlot: null, interact: false };
const DT = 1 / 60;
const rng = createRng(3);

function runSim(sim: WorldSimulation, seconds: number, cmd: (t: number) => PlayerCommand = () => IDLE): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += DT) events.push(...sim.update(DT, cmd(t)));
  return events;
}

/** Simulación con el reloj ajustado para empezar a una hora concreta. */
function simAtHour(hour: number, seed = 1) {
  return new WorldSimulation({ ...content, clock: { ...content.clock, startHour: hour } }, seed);
}

describe('reloj del mundo', () => {
  const clock = { dayLengthSeconds: 240, startHour: 8 };
  it('avanza las horas y los días', () => {
    expect(hourAt(clock, 0)).toBe(8);
    expect(hourAt(clock, 60)).toBe(14);
    expect(hourAt(clock, 160)).toBeCloseTo(0);
    expect(dayAt(clock, 0)).toBe(1);
    expect(dayAt(clock, 160)).toBe(2);
  });

  it('rangos horarios, incluidos los que cruzan la medianoche', () => {
    expect(inHourRange(10, [7, 18])).toBe(true);
    expect(inHourRange(18, [7, 18])).toBe(false);
    expect(inHourRange(23, [19, 6])).toBe(true);
    expect(inHourRange(3, [19, 6])).toBe(true);
    expect(inHourRange(12, [19, 6])).toBe(false);
    expect(inHourRange(12, null)).toBe(true);
  });

  it('oscuridad: día pleno, noche cerrada y transiciones', () => {
    expect(darknessAt(12)).toBe(0);
    expect(darknessAt(23)).toBe(1);
    expect(darknessAt(6)).toBeCloseTo(0.5);
    expect(darknessAt(19)).toBeCloseTo(0.5);
  });
});

describe('plantas', () => {
  it('el catálogo contiene las diez especies ficticias del MVP', () => {
    expect([...content.plants.all.keys()]).toEqual([
      'hoja-carmesi',
      'raiz-solar',
      'flor-de-escarcha',
      'hongo-azul',
      'espora-umbria',
      'savia-gris',
      'semilla-del-viento',
      'hoja-ligera',
      'raiz-vital',
      'flor-dorada',
    ]);
  });

  it('rechaza plantas sin propiedades ni terreno', () => {
    const bad = { plants: [{ id: 'x', name: 'X', itemId: 'x', biome: 'b', rarity: 'common', properties: [], regenSeconds: 5, conditions: { terrain: [] }, yield: { min: 2, max: 1 }, xp: 1 }] };
    try {
      parsePlantCatalog(bad, 'bad');
      expect.unreachable();
    } catch (e) {
      const msg = (e as DataValidationError).issues.join('\n');
      expect(msg).toContain('propiedad alquímica');
      expect(msg).toContain('tipo de suelo');
      expect(msg).toContain('min > max');
    }
  });

  it('cada zona de recolección coloca plantas sobre su terreno', () => {
    const field = PlantField.place(content.map, content.map.gatherZones, content.plants, createRng(1));
    for (const zone of content.map.gatherZones) {
      const nodes = [...field.all()].filter((n) => n.zoneId === zone.id);
      expect(nodes.length, zone.id).toBeGreaterThan(0);
      for (const n of nodes) {
        expect(plantGrowsAt(content.plants.get(n.plantId), content.map, Math.floor(n.position.x), Math.floor(n.position.y))).toBe(true);
      }
    }
  });

  it('la interacción prefiere la planta madura aunque haya otra regenerándose más cerca', () => {
    const zone = content.map.gatherZones.find((z) => z.id === 'hoja-carmesi-sendero');
    if (!zone) throw new Error('falta la zona');
    const field = PlantField.place(content.map, [{ ...zone, count: 2 }], content.plants, createRng(1));
    const [a, b] = [...field.all()];
    if (!a || !b) throw new Error('faltan plantas');
    field.harvest(a.id, 0, 12, rng);
    const between = { x: (a.position.x * 3 + b.position.x) / 4, y: (a.position.y * 3 + b.position.y) / 4 };
    const radius = Math.hypot(b.position.x - between.x, b.position.y - between.y) + 0.1;
    expect(field.nearest(between, radius, 1, 12)?.id).toBe(b.id);
    expect(field.nearest(a.position, 0.1, 1, 12)?.id).toBe(a.id); // solo la regenerándose al alcance
  });

  it('recolectar, esperar a que vuelva a crecer y respetar el horario', () => {
    const field = PlantField.place(content.map, content.map.gatherZones, content.plants, createRng(1));
    const carmesi = [...field.all()].find((n) => n.plantId === 'hoja-carmesi');
    const hongo = [...field.all()].find((n) => n.plantId === 'hongo-azul');
    if (!carmesi || !hongo) throw new Error('faltan plantas');
    const first = field.harvest(carmesi.id, 0, 12, rng);
    expect(first).toMatchObject({ ok: true, itemId: 'hoja-carmesi' });
    expect(field.harvest(carmesi.id, 10, 12, rng)).toEqual({ ok: false, reason: 'regrowing' });
    expect(field.isReady(carmesi, 45, 12)).toBe(true);
    // El Hongo Azul solo se recolecta de noche (19–6 h).
    expect(field.harvest(hongo.id, 0, 12, rng)).toEqual({ ok: false, reason: 'out-of-hours' });
    expect(field.harvest(hongo.id, 0, 22, rng).ok).toBe(true);
  });
});

describe('comportamientos de fauna', () => {
  const fleeing: CreatureBehavior = { type: 'fleeing', alertRadius: 6, fleeRadius: 3, fleeSeconds: 2, wanderRadius: 0 };
  const neutral: CreatureBehavior = { type: 'neutral', retaliateSeconds: 5, leashRadius: 20, attackRange: 1.2, wanderRadius: 0 };
  const territorial: CreatureBehavior = { type: 'territorial', territoryRadius: 3, leashRadius: 20, attackRange: 1.2, wanderRadius: 0 };
  const home = { x: 10, y: 10 };

  it('huidizo: alerta al detectar, huye al acercarse y se calma tras un tiempo', () => {
    const self = makeCombatant({ id: 'a', team: 'wild', position: home });
    const brain = new CreatureBrain(home, fleeing);
    const player = makeCombatant({ id: 'p', team: 'player', position: { x: 15, y: 10 } });
    const alert = brain.decide(self, player, 0, rng);
    expect(brain.state).toBe('alert');
    expect(alert.face?.x).toBeCloseTo(1);
    player.position = { x: 12, y: 10 };
    const flee = brain.decide(self, player, 0, rng);
    expect(brain.state).toBe('flee');
    expect(flee.move.x).toBeLessThan(0); // se aleja del jugador
    player.position = { x: 30, y: 30 };
    brain.decide(self, player, 2.5, rng);
    expect(brain.state).not.toBe('flee');
  });

  it('huidizo: recibir daño provoca la huida aunque el jugador esté lejos', () => {
    const self = makeCombatant({ id: 'a', team: 'wild', position: home });
    const brain = new CreatureBrain(home, fleeing);
    const player = makeCombatant({ id: 'p', team: 'player', position: { x: 18, y: 10 } });
    brain.notifyDamaged(0);
    brain.decide(self, player, 0.1, rng);
    expect(brain.state).toBe('flee');
  });

  it('neutral: ignora al jugador hasta recibir daño y luego responde un tiempo', () => {
    const self = makeCombatant({ id: 'a', team: 'wild', position: home });
    const brain = new CreatureBrain(home, neutral);
    const player = makeCombatant({ id: 'p', team: 'player', position: { x: 11, y: 10 } });
    expect(brain.decide(self, player, 0, rng).attack).toBeNull();
    brain.notifyDamaged(1);
    expect(brain.decide(self, player, 1.1, rng).attack).not.toBeNull();
    brain.decide(self, player, 7, rng);
    expect(brain.state).toBe('return');
  });

  it('territorial: ataca solo dentro de su territorio y deja de perseguir al salir', () => {
    const self = makeCombatant({ id: 'a', team: 'wild', position: home });
    const brain = new CreatureBrain(home, territorial);
    const player = makeCombatant({ id: 'p', team: 'player', position: { x: 16, y: 10 } });
    brain.decide(self, player, 0, rng);
    expect(brain.state).not.toBe('chase');
    player.position = { x: 12, y: 10 };
    brain.decide(self, player, 0, rng);
    expect(brain.state).toBe('chase');
    player.position = { x: 16, y: 10 }; // fuera de 3 × 1,6
    brain.decide(self, player, 0, rng);
    expect(brain.state).toBe('return');
  });
});

describe('ecosistema en la simulación', () => {
  it('las referencias del contenido son válidas', () => {
    expect(validateContentReferences(content)).toEqual([]);
    // La validación solo lee estas propiedades del mapa.
    const { id, catalog, spawnZones, npcs } = content.map;
    const map = { id, catalog, spawnZones, npcs, gatherZones: [{ id: 'z', plantId: 'nada', center: { x: 1, y: 1 }, radius: 1, count: 1 }] };
    const bad = { ...content, map: map as unknown as typeof content.map };
    expect(validateContentReferences(bad)).toContainEqual(expect.stringContaining('planta "nada" inexistente'));
  });

  it('la fauna aparece en su hábitat, en el equipo "wild" y solo en su horario', () => {
    const day = simAtHour(12);
    const fauna = [...day.creatures.values()].filter((c) => c.def.category === 'fauna');
    expect(new Set(fauna.map((c) => c.def.id))).toEqual(new Set(['conejo-cola-algodon', 'ciervo-cola-blanca', 'pavo-silvestre', 'pecari-de-collar']));
    for (const c of fauna) {
      expect(c.combatant.team).toBe('wild');
      const x = Math.floor(c.combatant.position.x);
      const y = Math.floor(c.combatant.position.y);
      const tiles = [content.map.tileAt('ground', x, y), content.map.tileAt('detail', x, y)];
      expect(c.def.habitat.some((h) => tiles.includes(h)), c.id).toBe(true);
    }
    // A las 23 h no hay pavos (activos 6–20 h); el pecarí no tiene horario.
    const night = simAtHour(23);
    const ids = [...night.creatures.values()].map((c) => c.def.id);
    expect(ids).not.toContain('pavo-silvestre');
    expect(ids).toContain('pecari-de-collar');
  });

  it('al salir de su horario, la fauna lejana desaparece', () => {
    const sim = new WorldSimulation({ ...content, clock: { dayLengthSeconds: 24, startHour: 19.9 } }, 2);
    const turkeys = () => [...sim.creatures.values()].filter((c) => c.def.id === 'pavo-silvestre');
    expect(turkeys().length).toBeGreaterThan(0);
    const far = turkeys().every((c) => Math.hypot(c.combatant.position.x - sim.player.position.x, c.combatant.position.y - sim.player.position.y) > ACTIVE_RADIUS);
    expect(far).toBe(true);
    const events = runSim(sim, 1.5);
    expect(events.some((e) => e.type === 'despawned')).toBe(true);
    expect(turkeys()).toHaveLength(0);
  });

  it('recolectar con E: objeto al inventario, XP y aviso si aún no creció', () => {
    const sim = simAtHour(12);
    const node = [...sim.plants.all()].find((n) => n.plantId === 'hoja-carmesi');
    if (!node) throw new Error('sin plantas');
    sim.player.position = { x: node.position.x + 0.5, y: node.position.y };
    expect(sim.interactionTarget()).toMatchObject({ node: { id: node.id }, ready: true });
    const events = sim.update(DT, { ...IDLE, interact: true });
    const harvested = events.find((e) => e.type === 'harvested');
    expect(harvested).toMatchObject({ nodeId: node.id, itemId: 'hoja-carmesi' });
    expect(sim.character.inventory.count('hoja-carmesi')).toBeGreaterThan(0);
    expect(sim.xp).toBe(content.plants.get('hoja-carmesi').xp);
    runSim(sim, 0.5);
    expect(sim.update(DT, { ...IDLE, interact: true })).toContainEqual({ type: 'interact-failed', reason: 'regrowing' });
    // Fuera del alcance de interacción no hay objetivo.
    sim.player.position = { x: node.position.x + INTERACT_RADIUS + 0.5, y: node.position.y };
    const target = sim.interactionTarget();
    expect(target?.kind === 'plant' ? target.node.id : null).not.toBe(node.id);
  });

  it('cazar un animal huidizo entrega XP y botín de fauna', () => {
    const sim = simAtHour(12);
    const rabbit = [...sim.creatures.values()].find((c) => c.def.id === 'conejo-cola-algodon');
    if (!rabbit) throw new Error('sin conejos');
    rabbit.combatant.position = { x: sim.player.position.x + 1, y: sim.player.position.y };
    rabbit.combatant.hp = 1;
    const events = runSim(sim, 0.3, (t) => ({ ...IDLE, aim: { x: 1, y: 0 }, action: t === 0 ? 'basic' : null, pressed: t === 0 }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'defeated', creatureId: 'conejo-cola-algodon', lootTable: 'conejo' }));
  });
});
