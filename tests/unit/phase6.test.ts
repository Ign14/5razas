import { describe, expect, it } from 'vitest';
import { selectDialogue } from '../../src/core/narrative/dialogue.ts';
import {
  checksumOf,
  createSave,
  decodeBits,
  encodeBits,
  loadSave,
  MemorySaveStorage,
  SAVE_SCHEMA_VERSION,
  type SavePayload,
} from '../../src/core/persistence/saveGame.ts';
import { QuestLog } from '../../src/core/quests/quests.ts';
import {
  validateContentReferences,
  WorldSimulation,
  type CreatureInstance,
  type PlayerCommand,
  type SimEvent,
} from '../../src/core/simulation/worldSimulation.ts';
import { loadTestContent } from './helpers.ts';

const content = loadTestContent();
const IDLE: PlayerCommand = { move: { x: 0, y: 0 }, aim: null, action: null, pressed: false, quickSlot: null, interact: false };
const DT = 1 / 60;
const BOSS = 'centinela-de-las-raices';

function runSim(sim: WorldSimulation, seconds: number, cmd: (t: number) => PlayerCommand = () => IDLE): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds; t += DT) events.push(...sim.update(DT, cmd(t)));
  return events;
}

/**
 * Deja la criatura con 1 de vida y la remata con ataques básicos. Un jefe puede pasar a otra fase
 * (invulnerable unos instantes), por lo que se sigue atacando hasta derrotarlo.
 */
function finish(sim: WorldSimulation, c: CreatureInstance): SimEvent[] {
  c.combatant.hp = 1;
  const events: SimEvent[] = [];
  for (let t = 0; t < 4 && !events.some((e) => e.type === 'defeated' && e.id === c.id); t += DT) {
    sim.player.position = { x: c.combatant.position.x - 1, y: c.combatant.position.y };
    sim.player.hp = sim.player.stats.life;
    events.push(...sim.update(DT, { ...IDLE, aim: { x: 1, y: 0 }, action: 'basic', pressed: false }));
  }
  return events;
}

const bossOf = (sim: WorldSimulation) => [...sim.creatures.values()].find((c) => c.def.id === BOSS);

describe('contenido de la Fase 6', () => {
  it('referencias válidas: jefe, misiones, PNJ y diálogos', () => {
    expect(validateContentReferences(content)).toEqual([]);
    expect(content.map.npcs.map((n) => n.npcId)).toContain('vigia-del-sendero');
    expect(content.creatures.get(BOSS).boss?.phases).toHaveLength(3);
  });
});

describe('Centinela de las Raíces (jefe de tres fases)', () => {
  function engaged() {
    const sim = new WorldSimulation(content, 4);
    const boss = bossOf(sim);
    if (!boss) throw new Error('el jefe no apareció');
    sim.player.position = { x: boss.combatant.position.x - 3, y: boss.combatant.position.y };
    sim.player.invulnerableUntil = 1e9; // el jugador sobrevive para observar las fases
    return { sim, boss };
  }

  it('cambia de fase según su vida, con transición invulnerable', () => {
    const { sim, boss } = engaged();
    expect(boss.boss?.phase).toBe(0);
    boss.combatant.hp = boss.combatant.stats.life * 0.6;
    const events = runSim(sim, 0.1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-phase', phase: 1, name: 'Raíces del claro' }));
    expect(boss.combatant.isInvulnerable(sim.time)).toBe(true);
  });

  it('fase 2: hace brotar obstáculos que bloquean el paso y luego desaparecen', () => {
    const { sim, boss } = engaged();
    boss.combatant.hp = boss.combatant.stats.life * 0.6;
    const events = runSim(sim, 3);
    const spawned = events.flatMap((e) => (e.type === 'obstacle-spawned' ? [e.obstacle] : []));
    expect(spawned.length).toBeGreaterThan(0);
    const o = spawned[0];
    if (!o) throw new Error();
    expect(sim.world.isBlocked(o.x, o.y)).toBe(true);
    expect(content.map.isBlocked(o.x, o.y)).toBe(false);
    const later = runSim(sim, 7);
    expect(later.some((e) => e.type === 'obstacle-removed')).toBe(true);
    expect(sim.world.isBlocked(o.x, o.y)).toBe(false);
  });

  it('fase 3: más velocidad, ataque combinado y vulnerabilidad temporal', () => {
    const { sim, boss } = engaged();
    const baseSpeed = boss.combatant.stats.speed;
    boss.combatant.hp = boss.combatant.stats.life * 0.3;
    runSim(sim, 0.1);
    expect(boss.boss?.phase).toBe(2);
    expect(boss.combatant.stats.speed).toBeCloseTo(baseSpeed * 1.4);
    sim.player.position = { x: boss.combatant.position.x - 1.5, y: boss.combatant.position.y };
    const events = runSim(sim, 4);
    const used = events.flatMap((e) => (e.type === 'ability' && e.casterId === boss.id ? [e.ability.id] : []));
    expect(used).toContain('raiz-tempestad');
    expect(events).toContainEqual({ type: 'status', targetId: boss.id, statusId: 'vulnerable' });
  });

  it('si el jugador cae, el jefe se recupera y vuelve a la primera fase', () => {
    const { sim, boss } = engaged();
    const baseSpeed = boss.combatant.stats.speed;
    boss.combatant.hp = boss.combatant.stats.life * 0.3;
    runSim(sim, 0.1);
    expect(boss.boss?.phase).toBe(2);
    // El jugador se aleja más allá de la correa (pero dentro del radio activo de la IA): el jefe
    // deja de pelear, regresa a su sitio y se reinicia.
    runSim(sim, 2);
    sim.player.position = { x: boss.brain.home.x - 15, y: boss.brain.home.y };
    const events = runSim(sim, 15);
    expect(boss.combatant.hp).toBe(boss.combatant.stats.life);
    expect(boss.boss?.phase).toBe(0);
    expect(boss.combatant.stats.speed).toBeCloseTo(baseSpeed);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-phase', phase: 0 }));
  });

  it('un primer golpe a distancia no reinicia al jefe (queda provocado)', () => {
    const { sim, boss } = engaged();
    sim.player.position = { x: boss.combatant.position.x - 1.2, y: boss.combatant.position.y };
    sim.update(DT, { ...IDLE, aim: { x: 1, y: 0 }, action: 'basic', pressed: true });
    runSim(sim, 0.3);
    expect(boss.combatant.hp).toBeLessThan(boss.combatant.stats.life);
  });

  it('al ser derrotado entrega botín especial y no reaparece', () => {
    const { sim, boss } = engaged();
    sim.player.invulnerableUntil = 0;
    const events = finish(sim, boss);
    expect(events).toContainEqual({ type: 'boss-defeated', creatureId: BOSS });
    const items = events.flatMap((e) => (e.type === 'drop-spawned' ? [e.drop.itemId] : []));
    expect(items).toEqual(expect.arrayContaining(['amuleto-del-centinela', 'corazon-de-raiz']));
    runSim(sim, 5);
    expect(bossOf(sim)).toBeUndefined();
    expect(sim.population.defeatedBosses.has(BOSS)).toBe(true);
  });
});

describe('misiones y diálogos', () => {
  it('QuestLog: requisitos, progreso por señales, objetos y entrega', () => {
    const log = new QuestLog(content.quests);
    expect(log.status('senales-en-el-bosque')).toBe('available');
    expect(log.status('saber-de-las-plantas')).toBe('locked');
    expect(log.accept('saber-de-las-plantas')).toBe(false);
    log.accept('senales-en-el-bosque');
    log.signal({ kind: 'defeat', target: 'ash-moth' });
    expect(log.progress('senales-en-el-bosque', 'brotes')).toBe(0);
    for (let i = 0; i < 2; i++) log.signal({ kind: 'defeat', target: 'thorn-sprout' });
    expect(log.status('senales-en-el-bosque')).toBe('active');
    expect(log.signal({ kind: 'defeat', target: 'thorn-sprout' })).toContainEqual({ type: 'quest-completed', questId: 'senales-en-el-bosque' });
    expect(log.turnIn('senales-en-el-bosque')?.xp).toBe(60);
    expect(log.status('saber-de-las-plantas')).toBe('available');
    log.accept('saber-de-las-plantas');
    log.signal({ kind: 'gather', target: 'hoja-carmesi', amount: 5 });
    expect(log.progress('saber-de-las-plantas', 'hojas')).toBe(3);
  });

  it('el diálogo del PNJ depende del estado de las misiones', () => {
    const log = new QuestLog(content.quests);
    const npc = content.narrative.npcs.get('vigia-del-sendero');
    if (!npc) throw new Error();
    expect(selectDialogue(npc, log)).toBe('vigia-intro');
    log.accept('senales-en-el-bosque');
    expect(selectDialogue(npc, log)).toBe('vigia-brotes-activo');
  });

  it('flujo completo en la simulación: hablar, aceptar, cumplir, entregar y recibir recompensas', () => {
    const sim = new WorldSimulation(content, 5);
    const npc = content.map.npcs[0];
    if (!npc) throw new Error();
    sim.player.position = { x: npc.position.x + 1, y: npc.position.y };
    expect(sim.interactionTarget()).toMatchObject({ kind: 'npc', npcId: 'vigia-del-sendero' });
    const talk = sim.update(DT, { ...IDLE, interact: true });
    expect(talk).toContainEqual({ type: 'dialogue', npcId: 'vigia-del-sendero', dialogueId: 'vigia-intro' });
    expect(sim.chooseDialogueOption('vigia-intro', 0)).toBe('vigia-brotes-activo');
    expect(sim.quests.status('senales-en-el-bosque')).toBe('active');

    for (let i = 0; i < 3; i++) {
      const sprout = [...sim.creatures.values()].find((c) => c.def.id === 'thorn-sprout');
      if (!sprout) throw new Error('sin brotes');
      finish(sim, sprout);
    }
    expect(sim.quests.status('senales-en-el-bosque')).toBe('completed');
    const potions = sim.character.inventory.count('tonico-vital');
    const xp = sim.xp;
    expect(sim.chooseDialogueOption('vigia-brotes-hecho', 0)).toBe('vigia-plantas-oferta');
    expect(sim.quests.status('senales-en-el-bosque')).toBe('turned-in');
    expect(sim.character.inventory.count('tonico-vital')).toBe(potions + 2);
    expect(sim.xp).toBe(xp + 60);
    // Una opción de entrega no vuelve a dar recompensas.
    expect(sim.chooseDialogueOption('vigia-brotes-hecho', 0)).toBeNull();
    expect(sim.xp).toBe(xp + 60);
  });

  it('descubrir una receta cumple "El primer elixir"', () => {
    const sim = new WorldSimulation(content, 5);
    sim.quests.restore({
      'senales-en-el-bosque': { state: 'turned-in', progress: { brotes: 3 } },
      'saber-de-las-plantas': { state: 'turned-in', progress: { hojas: 3 } },
    });
    expect(sim.chooseDialogueOption('vigia-elixir-oferta', 0)).toBe('vigia-elixir-activo');
    sim.character.inventory.add('hoja-carmesi', 1);
    sim.character.inventory.add('raiz-solar', 1);
    sim.experiment([{ itemId: 'hoja-carmesi', quantity: 1 }, { itemId: 'raiz-solar', quantity: 1 }]);
    expect(sim.quests.status('el-primer-elixir')).toBe('completed');
  });
});

describe('guardado', () => {
  function playedSim() {
    const sim = new WorldSimulation(content, 9);
    sim.addXp(150);
    sim.character.inventory.add('hoja-carmesi', 4);
    sim.character.inventory.add('peto-de-corteza', 1);
    sim.equip(sim.character.inventory.contents.findIndex((s) => s?.itemId === 'peto-de-corteza'));
    sim.character.assignQuickSlot(1, 'tonico-vital');
    sim.character.inventory.add('raiz-solar', 1);
    sim.experiment([{ itemId: 'hoja-carmesi', quantity: 1 }, { itemId: 'raiz-solar', quantity: 1 }]);
    sim.chooseDialogueOption('vigia-intro', 0);
    runSim(sim, 1);
    sim.player.position = { x: 33.5, y: 33.5 };
    sim.player.hp = 50;
    const boss = bossOf(sim);
    if (boss) finish(sim, boss);
    return sim;
  }

  const payloadOf = (sim: WorldSimulation): SavePayload => ({ ...sim.snapshot(), exploration: encodeBits([1, 1, 0, 0, 0, 1]), settings: {} });

  it('guardar y cargar restaura personaje, inventario, equipo, recetas, misiones, jefes y tiempo', async () => {
    const a = playedSim();
    const storage = new MemorySaveStorage();
    await storage.save('slot1', createSave(payloadOf(a), new Date('2026-10-31T00:00:00Z')));
    const loaded = loadSave(await storage.load('slot1'));
    if (!loaded.ok) throw new Error(loaded.issues.join('; '));
    expect(loaded.migrated).toBe(false);

    const b = new WorldSimulation(content, 123);
    expect(b.restore(loaded.save.payload)).toEqual([]);
    const sa = a.snapshot();
    const sb = b.snapshot();
    expect(sb.xp).toBe(sa.xp);
    expect(sb.inventory).toEqual(sa.inventory);
    expect(sb.equipment).toEqual(sa.equipment);
    expect(sb.quickSlots).toEqual(sa.quickSlots);
    expect(sb.discoveries).toEqual(['elixir-de-brasa']);
    expect(sb.quests).toEqual(sa.quests);
    expect(sb.bossesDefeated).toEqual([BOSS]);
    expect(bossOf(b)).toBeUndefined();
    expect(sb.worldTime).toBeCloseTo(sa.worldTime);
    expect(b.player.stats).toEqual(a.player.stats);
    expect(sb.player.hp).toBe(sa.player.hp);
    expect(decodeBits(loaded.save.payload.exploration, 6)).toEqual([1, 1, 0, 0, 0, 1]);
  });

  it('detecta archivos dañados, versiones futuras y estructuras inválidas', () => {
    const save = createSave(payloadOf(new WorldSimulation(content, 1)), new Date());
    const tampered = { ...save, payload: { ...save.payload, xp: 999_999 } };
    expect(loadSave(tampered)).toEqual({ ok: false, issues: [expect.stringContaining('suma de verificación')] });
    expect(loadSave({ ...save, schemaVersion: SAVE_SCHEMA_VERSION + 1 })).toMatchObject({ ok: false });
    expect(loadSave(null)).toMatchObject({ ok: false });
    const broken = { ...save.payload, inventory: 'nada' };
    expect(loadSave({ ...save, payload: broken, checksum: checksumOf(broken) })).toMatchObject({ ok: false, issues: [expect.stringContaining('inventory')] });
  });

  it('migra guardados de versiones anteriores con las migraciones registradas', () => {
    const save = createSave(payloadOf(new WorldSimulation(content, 1)), new Date());
    // Simular que el esquema actual es 2 y existe una migración 1 → 2.
    const migrations = { 1: (p: Record<string, unknown>) => ({ ...p, settings: { migrado: true } }) };
    const r = loadSave(save, migrations, 2);
    expect(r.ok && r.migrated).toBe(true);
    expect(r.ok && r.save.payload.settings).toEqual({ migrado: true });
    expect(loadSave(save, {}, 2)).toEqual({ ok: false, issues: ['no hay migración desde la versión 1'] });
  });

  it('al cargar descarta referencias desconocidas sin fallar', () => {
    const sim = new WorldSimulation(content, 1);
    const payload: SavePayload = {
      ...payloadOf(sim),
      inventory: [{ itemId: 'objeto-eliminado', quantity: 1 }, { itemId: 'tonico-vital', quantity: 2 }],
      equipment: { weapon: 'peto-de-corteza' },
      player: { x: 0.5, y: 0.5, hp: 10, energy: 10 },
    };
    const warnings = sim.restore(payload);
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('desconocidos'), expect.stringContaining('peto-de-corteza'), expect.stringContaining('posición')]));
    expect(sim.character.inventory.count('tonico-vital')).toBe(2);
    expect(sim.player.position).toEqual(content.map.spawn);
  });

  it('codificación de la exploración por tramos', () => {
    const bits = [0, 0, 0, 1, 1, 0, 1, 1, 1, 1];
    expect(encodeBits(bits)).toBe('0:3,1:2,0:1,1:4');
    expect(decodeBits(encodeBits(bits), bits.length)).toEqual(bits);
    expect(() => decodeBits('0:3', 4)).toThrow();
  });
});
