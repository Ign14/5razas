import { describe, expect, it } from 'vitest';
import { CreatureBrain } from '../../src/core/ai/creatureBrain.ts';
import { createRng } from '../../src/core/math/random.ts';
import { creatureXp } from '../../src/core/progression/progression.ts';
import {
  PLAYER_ID,
  PLAYER_RESPAWN_SECONDS,
  validateContentReferences,
  WorldSimulation,
  type PlayerCommand,
  type SimEvent,
} from '../../src/core/simulation/worldSimulation.ts';
import { loadTestContent, makeCombatant } from './helpers.ts';

const content = loadTestContent();
const IDLE: PlayerCommand = { move: { x: 0, y: 0 }, aim: null, action: null, pressed: false, quickSlot: null };
const DT = 1 / 60;

function runSim(sim: WorldSimulation, seconds: number, cmd: (t: number) => PlayerCommand = () => IDLE): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += DT) events.push(...sim.update(DT, cmd(t)));
  return events;
}

describe('IA de criatura', () => {
  const behavior = { type: 'aggressive' as const, aggroRadius: 5, leashRadius: 10, attackRange: 1.3, wanderRadius: 0 };
  const rng = createRng(1);

  it('persigue al detectar, ataca en rango y regresa al superar la correa', () => {
    const self = makeCombatant({ id: 'c', position: { x: 10, y: 10 } });
    const brain = new CreatureBrain({ x: 10, y: 10 }, behavior);
    const target = makeCombatant({ id: 'p', team: 'player', position: { x: 30, y: 10 } });

    expect(brain.decide(self, target, 0, rng).move).toEqual({ x: 0, y: 0 });
    target.position = { x: 14, y: 10 };
    const chase = brain.decide(self, target, 0, rng);
    expect(brain.state).toBe('chase');
    expect(chase.move.x).toBeCloseTo(1);

    target.position = { x: 11, y: 10 };
    expect(brain.decide(self, target, 0, rng).attack).toEqual({ x: 1, y: 0 });

    // El jugador huye más allá de la correa: la criatura vuelve y se cura al llegar.
    self.position = { x: 19, y: 10 };
    self.hp = 10;
    target.position = { x: 25, y: 10 };
    brain.decide(self, target, 0, rng);
    expect(brain.state).toBe('return');
    self.position = { x: 10.1, y: 10 };
    brain.decide(self, target, 0, rng);
    expect(brain.state).toBe('idle');
    expect(self.hp).toBe(self.stats.life);
  });

  it('no actúa mientras está ocupado', () => {
    const self = makeCombatant({ id: 'c', position: { x: 10, y: 10 } });
    self.busyUntil = 5;
    const brain = new CreatureBrain({ x: 10, y: 10 }, behavior);
    const target = makeCombatant({ id: 'p', team: 'player', position: { x: 11, y: 10 } });
    expect(brain.decide(self, target, 1, rng).attack).toBeNull();
  });
});

describe('WorldSimulation con el contenido real', () => {
  it('las referencias entre archivos son válidas', () => {
    expect(validateContentReferences(content)).toEqual([]);
    const broken = { ...content, profession: { ...content.profession, abilities: { ...content.profession.abilities, power1: 'nope' } } };
    expect(validateContentReferences(broken)).toEqual([expect.stringContaining('"nope"')]);
  });

  it('detecta botín, conjuntos y equipo inicial con referencias rotas', () => {
    const brokenLoot = {
      ...content,
      lootTables: { all: new Map([['thorn-sprout-common', { id: 'thorn-sprout-common', entries: [{ itemId: 'fantasma', chance: 1, min: 1, max: 1 }] }]]), get: (id: string) => content.lootTables.get(id) },
    };
    const problems = validateContentReferences(brokenLoot);
    expect(problems).toContainEqual(expect.stringContaining('"fantasma"'));
    expect(problems).toContainEqual(expect.stringContaining('tabla de botín "ash-moth-common" inexistente'));
    const badStart = { ...content, character: { ...content.character, startingEquipment: ['tonico-vital'] } };
    expect(validateContentReferences(badStart)).toContainEqual(expect.stringContaining('no es equipable'));
  });

  it('hace aparecer las criaturas de todas las zonas del mapa', () => {
    const sim = new WorldSimulation(content, 7);
    const expected = content.map.spawnZones.reduce((n, z) => n + z.count, 0);
    expect(content.map.spawnZones.length).toBeGreaterThanOrEqual(4);
    expect(sim.creatures.size).toBe(expected);
    for (const c of sim.creatures.values()) {
      expect(content.map.isBlocked(Math.floor(c.combatant.position.x), Math.floor(c.combatant.position.y))).toBe(false);
    }
  });

  it('ninguna zona puede detectar al jugador en su punto de aparición', () => {
    for (const z of content.map.spawnZones) {
      const c = content.creatures.get(z.creatureId);
      const reach = z.radius + c.behavior.wanderRadius + c.behavior.aggroRadius;
      const d = Math.hypot(z.center.x - content.map.spawn.x, z.center.y - content.map.spawn.y);
      expect(d, z.id).toBeGreaterThan(reach + 1);
    }
  });

  it('derrotar una criatura entrega experiencia y la criatura reaparece', () => {
    const sim = new WorldSimulation(content, 3);
    const [victim] = sim.creatures.values();
    if (!victim) throw new Error('sin criaturas');
    // Colocar a la criatura junto al jugador, con poca vida.
    victim.combatant.position = { x: sim.player.position.x + 1, y: sim.player.position.y };
    victim.combatant.hp = 1;
    const aim = { x: 1, y: 0 };
    const events = runSim(sim, 0.3, (t) => ({ ...IDLE, aim, action: t === 0 ? 'basic' : null, pressed: t === 0 }));
    const defeated = events.find((e) => e.type === 'defeated');
    const xp = creatureXp(content.progression, victim.def.xpReward, victim.level);
    expect(defeated).toMatchObject({ id: victim.id, creatureId: victim.def.id, xp });
    expect(sim.xp).toBe(xp);
    expect(sim.creatures.has(victim.id)).toBe(false);

    // Alejar al jugador del área para permitir la reaparición.
    sim.player.position = { ...content.map.spawn };
    const later = runSim(sim, victim.def.spawnRules.respawnSeconds + 1.5);
    expect(later.some((e) => e.type === 'spawned')).toBe(true);
  });

  it('las criaturas persiguen y dañan al jugador; el jugador muere y reaparece', () => {
    const sim = new WorldSimulation(content, 11);
    const [foe] = sim.creatures.values();
    if (!foe) throw new Error('sin criaturas');
    sim.player.position = { x: foe.combatant.position.x + 2.5, y: foe.combatant.position.y };
    sim.player.hp = 15;
    const events = runSim(sim, 20);
    expect(events.some((e) => e.type === 'damage' && e.targetId === PLAYER_ID)).toBe(true);
    expect(events.some((e) => e.type === 'player-died')).toBe(true);
    expect(events.some((e) => e.type === 'player-respawned')).toBe(true);
    expect(sim.player.alive).toBe(true);
    expect(sim.player.hp).toBe(sim.player.stats.life);
    expect(PLAYER_RESPAWN_SECONDS).toBeGreaterThan(0);
  });

  it('reporta acciones fallidas (energía insuficiente) sin reportar el ataque básico', () => {
    const sim = new WorldSimulation(content, 1);
    sim.addXp(1000); // Desbloquear todas las habilidades.
    sim.player.energy = 0;
    const events = sim.update(DT, { ...IDLE, action: 'final', pressed: true });
    expect(events).toContainEqual({ type: 'action-failed', slot: 'final', reason: 'energy' });
    sim.update(DT, { ...IDLE, action: 'basic' });
    const again = sim.update(DT, { ...IDLE, action: 'basic' });
    expect(again.some((e) => e.type === 'action-failed')).toBe(false);
  });

  it('almacena una acción pulsada mientras el personaje está ocupado', () => {
    const sim = new WorldSimulation(content, 1);
    sim.addXp(1000);
    sim.update(DT, { ...IDLE, action: 'power2', pressed: true }); // Corte Circular: ocupado durante su preparación.
    sim.update(DT, { ...IDLE, action: 'power3', pressed: true }); // Pulsado durante la preparación.
    expect(sim.player.cooldownRemaining('guardian-ward', sim.time)).toBe(0);
    runSim(sim, 0.2);
    expect(sim.player.cooldownRemaining('guardian-ward', sim.time)).toBeGreaterThan(10);
  });

  it('un clic durante la evasión se ejecuta al terminar; mantener el botón no se almacena', () => {
    const sim = new WorldSimulation(content, 1);
    sim.update(DT, { ...IDLE, action: 'dodge', pressed: true });
    sim.update(DT, { ...IDLE, action: 'basic', pressed: true });
    runSim(sim, 0.28);
    expect(sim.player.cooldownRemaining('guardian-strike', sim.time)).toBeGreaterThan(0);

    const held = new WorldSimulation(content, 1);
    held.update(DT, { ...IDLE, action: 'dodge', pressed: true });
    held.update(DT, { ...IDLE, action: 'basic', pressed: false });
    runSim(held, 0.28);
    expect(held.player.cooldownRemaining('guardian-strike', held.time)).toBe(0);
  });

  it('la evasión sigue la dirección de movimiento', () => {
    const sim = new WorldSimulation(content, 1);
    const start = sim.player.position;
    runSim(sim, 0.3, (t) => ({ ...IDLE, move: { x: 1, y: 0 }, aim: { x: -1, y: 0 }, action: t === 0 ? 'dodge' : null, pressed: t === 0 }));
    // Derecha en pantalla = +x, -y en celdas.
    expect(sim.player.position.x).toBeGreaterThan(start.x + 1);
    expect(sim.player.position.y).toBeLessThan(start.y - 1);
  });

  it('ciclo de progresión: derrotar → XP → subir de nivel (curación completa) → botín → recoger', () => {
    // Semilla con botín garantizado: se fuerza con una tabla de prueba de probabilidad 1.
    const guaranteed = {
      ...content,
      lootTables: {
        all: content.lootTables.all,
        get: () => ({ id: 't', entries: [{ itemId: 'espina-dura', chance: 1, min: 2, max: 2 }] }),
      },
    };
    const sim = new WorldSimulation(guaranteed, 3);
    const [victim] = sim.creatures.values();
    if (!victim) throw new Error('sin criaturas');
    const startLife = sim.player.stats.life;
    sim.player.hp = 10;
    victim.combatant.position = { x: sim.player.position.x + 1, y: sim.player.position.y };
    victim.combatant.hp = 1;
    const events = runSim(sim, 0.3, (t) => ({ ...IDLE, aim: { x: 1, y: 0 }, action: t === 0 ? 'basic' : null, pressed: t === 0 }));

    expect(events.some((e) => e.type === 'xp-gained')).toBe(true);
    const up = events.find((e) => e.type === 'level-up');
    expect(up).toMatchObject({ level: 2, stage: 'Novato', unlockedAbilities: ['guardian-charge'] });
    expect(sim.player.level).toBe(2);
    expect(sim.player.stats.life).toBe(startLife + content.profession.statsPerLevel.life);
    expect(sim.player.hp).toBe(sim.player.stats.life); // curación al subir de nivel

    const spawned = events.find((e) => e.type === 'drop-spawned');
    if (spawned?.type !== 'drop-spawned') throw new Error('no hubo botín');
    // Caminar hasta el objeto: se mueve al jugador directamente sobre él.
    sim.player.position = spawned.drop.position;
    const later = runSim(sim, 0.05);
    expect(later).toContainEqual(expect.objectContaining({ type: 'drop-collected', itemId: 'espina-dura', quantity: 2 }));
    expect(sim.character.inventory.count('espina-dura')).toBe(2);
  });

  it('equipar desde la simulación actualiza los atributos de combate', () => {
    const sim = new WorldSimulation(content, 1);
    const before = sim.player.stats.defense;
    sim.character.inventory.add('peto-de-corteza', 1);
    const index = sim.character.inventory.contents.findIndex((s) => s?.itemId === 'peto-de-corteza');
    expect(sim.equip(index)).toEqual({ ok: true });
    expect(sim.player.stats.defense).toBe(before + 5);
    expect(sim.drainEvents()).toContainEqual({ type: 'equipment-changed' });
    expect(sim.unequip('chest')).toEqual({ ok: true });
    expect(sim.player.stats.defense).toBe(before);
  });

  it('equipo inicial, inventario inicial y ranuras rápidas (Q/F)', () => {
    const sim = new WorldSimulation(content, 1);
    expect(sim.character.equipment.get('weapon')).toBe('hoja-de-corteza');
    expect(sim.character.quickSlots).toEqual(['tonico-vital', 'tonico-energia']);
    sim.player.hp = 20;
    const events = sim.update(DT, { ...IDLE, quickSlot: 0 });
    expect(events).toContainEqual({ type: 'item-used', itemId: 'tonico-vital' });
    expect(sim.player.hp).toBe(65);
    expect(sim.character.inventory.count('tonico-vital')).toBe(2);
  });

  it('las criaturas aparecen con niveles dentro de su rango y atributos escalados', () => {
    const sim = new WorldSimulation(content, 21);
    for (const c of sim.creatures.values()) {
      const [min, max] = c.def.levelRange;
      expect(c.level).toBeGreaterThanOrEqual(min);
      expect(c.level).toBeLessThanOrEqual(max);
      expect(c.combatant.stats.life).toBe(c.def.stats.life + c.def.statsPerLevel.life * (c.level - 1));
    }
  });

  it('es determinista con la misma semilla', () => {
    const play = (seed: number) => {
      const sim = new WorldSimulation(content, seed);
      runSim(sim, 5, (t) => ({ ...IDLE, move: { x: Math.sin(t), y: Math.cos(t) }, aim: { x: 1, y: 0 }, action: 'basic', pressed: false }));
      return [...sim.creatures.values()].map((c) => [c.id, c.combatant.position.x.toFixed(6), c.combatant.hp]);
    };
    expect(play(42)).toEqual(play(42));
  });
});
