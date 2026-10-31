import { CreatureBrain } from '../ai/creatureBrain.ts';
import { Navigator } from '../ai/navigator.ts';
import type { AbilityCatalog, AbilityDefinition } from '../combat/abilities.ts';
import { Combatant } from '../combat/combatant.ts';
import { CombatWorld, type CombatEvent, type UseFailure } from '../combat/combatWorld.ts';
import type { StatusCatalog } from '../combat/statusEffects.ts';
import type { CharacterConfig } from '../data/characterConfig.ts';
import type { CreatureCatalog, CreatureDefinition } from '../creatures/creatureCatalog.ts';
import { cellToScreen, screenDirToCellDir } from '../math/iso.ts';
import { createRng, type Rng } from '../math/random.ts';
import { distance, length, type Vec2 } from '../math/vector.ts';
import { MAX_DT_SECONDS, stepMotion, stepMotionCells, type MotionState } from '../movement/characterMotion.ts';
import { directionFromScreenVector } from '../movement/direction.ts';
import type { ActionSlot, ProfessionDefinition } from '../professions/profession.ts';
import { collides } from '../world/collision.ts';
import type { SpawnZone, WorldMap } from '../world/worldMap.ts';

export interface SimulationContent {
  readonly map: WorldMap;
  readonly character: CharacterConfig;
  readonly profession: ProfessionDefinition;
  readonly abilities: AbilityCatalog;
  readonly statuses: StatusCatalog;
  readonly creatures: CreatureCatalog;
}

/** Órdenes del jugador para un frame, ya traducidas desde el dispositivo de entrada. */
export interface PlayerCommand {
  /** Intención de movimiento en pantalla (WASD), longitud 0 o 1. */
  readonly move: Vec2;
  /** Dirección de apuntado en celdas (p. ej. hacia el ratón), o null para usar la última. */
  readonly aim: Vec2 | null;
  readonly action: ActionSlot | null;
  /**
   * true si la acción se pulsó en este fotograma (tecla o clic nuevo); false si solo se mantiene
   * (ataque básico con el botón presionado). Solo las pulsaciones nuevas usan el búfer de entrada.
   */
  readonly pressed: boolean;
}

export type SimEvent =
  | CombatEvent
  | { readonly type: 'spawned'; readonly id: string; readonly creatureId: string }
  | { readonly type: 'defeated'; readonly id: string; readonly creatureId: string; readonly xp: number; readonly lootTable: string; readonly position: Vec2 }
  | { readonly type: 'player-died' }
  | { readonly type: 'player-respawned' }
  | { readonly type: 'action-failed'; readonly slot: ActionSlot; readonly reason: UseFailure };

export interface CreatureInstance {
  readonly id: string;
  readonly def: CreatureDefinition;
  readonly zoneId: string;
  readonly combatant: Combatant;
  readonly brain: CreatureBrain;
  readonly ability: AbilityDefinition;
  motion: MotionState;
}

export const PLAYER_ID = 'player';
/** Las criaturas más lejanas que esto (celdas) no ejecutan IA (GAME_DESIGN §14). */
export const ACTIVE_RADIUS = 22;
export const PLAYER_RESPAWN_SECONDS = 3;
/** Ventana durante la que se recuerda una acción pulsada mientras el personaje está ocupado. */
export const INPUT_BUFFER_SECONDS = 0.3;
/** Distancia mínima al jugador para hacer aparecer criaturas. */
const SPAWN_SAFE_DISTANCE = 6;

/**
 * Simulación completa del sector: jugador, criaturas, IA, combate y apariciones.
 * No depende de Phaser; la escena solo traduce entrada y dibuja los eventos.
 */
export class WorldSimulation {
  readonly combat: CombatWorld;
  readonly player: Combatant;
  playerMotion: MotionState;
  readonly creatures = new Map<string, CreatureInstance>();
  /** Experiencia acumulada (la Fase 3 la convertirá en niveles). */
  xp = 0;
  private readonly content: SimulationContent;
  private readonly rng: Rng;
  private readonly respawns: { zone: SpawnZone; at: number }[] = [];
  private playerRespawnAt: number | null = null;
  private buffered: { slot: ActionSlot; until: number } | null = null;
  private serial = 0;
  private events: SimEvent[] = [];

  constructor(content: SimulationContent, seed = 1) {
    this.content = content;
    this.rng = createRng(seed);
    this.combat = new CombatWorld(content.map, content.statuses, this.rng);
    const { profession, character, map } = content;
    this.player = new Combatant({
      id: PLAYER_ID,
      team: 'player',
      position: map.spawn,
      stats: profession.baseStats,
      level: 1,
      hurtboxRadius: profession.hurtboxRadius,
      colliderHalfSize: character.colliderHalfSize,
      invulnerabilityOnHit: profession.invulnerabilityOnHit,
      poise: Infinity, // El jugador controla sus propias acciones (no se interrumpe).
      energyRegen: profession.energyRegen,
    });
    this.combat.add(this.player);
    this.playerMotion = { position: map.spawn, facing: 's', moving: false };
    for (const zone of map.spawnZones) for (let i = 0; i < zone.count; i++) this.spawnCreature(zone);
  }

  get time(): number {
    return this.combat.time;
  }

  abilityFor(slot: ActionSlot): AbilityDefinition {
    return this.content.abilities.get(this.content.profession.abilities[slot]);
  }

  update(dtSeconds: number, cmd: PlayerCommand): SimEvent[] {
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_DT_SECONDS);
    this.updatePlayer(dt, cmd);
    this.updateCreatures(dt);
    this.combat.update(dt);
    this.playerMotion = { ...this.playerMotion, position: this.player.position };
    for (const c of this.creatures.values()) c.motion = { ...c.motion, position: c.combatant.position };
    for (const e of this.combat.drainEvents()) this.handleCombatEvent(e);
    this.processRespawns();
    const out = this.events;
    this.events = [];
    return out;
  }

  private updatePlayer(dt: number, cmd: PlayerCommand): void {
    const p = this.player;
    if (!p.alive) {
      this.playerMotion = { ...this.playerMotion, moving: false };
      return;
    }
    // Una pulsación nueva reemplaza a la almacenada; mantener el ataque básico no se almacena.
    if (cmd.action && cmd.pressed) this.buffered = { slot: cmd.action, until: this.time + INPUT_BUFFER_SECONDS };
    if (this.buffered && this.time > this.buffered.until) this.buffered = null;
    const slot = this.buffered?.slot ?? cmd.action;
    if (slot) {
      const ability = this.abilityFor(slot);
      const moveCells = screenDirToCellDir(cmd.move);
      // La evasión sigue la dirección de movimiento; el resto apunta al cursor.
      const aim = slot === 'dodge' && length(moveCells) > 0 ? moveCells : (cmd.aim ?? p.aim);
      const result = this.combat.useAbility(p.id, ability, aim);
      if (result.ok) {
        this.buffered = null;
        const facing = directionFromScreenVector(cellToScreen(p.aim));
        if (facing) this.playerMotion = { ...this.playerMotion, facing };
      } else if (result.reason !== 'busy' && slot !== 'basic') {
        // Solo "ocupado" justifica esperar; el resto de fallos se informa una vez.
        this.buffered = null;
        this.events.push({ type: 'action-failed', slot, reason: result.reason });
      }
    }
    if (p.canAct(this.time)) {
      // La posición autoritativa es la del combatiente (puede cambiar por dash, retroceso o carga).
      const base = { ...this.playerMotion, position: p.position };
      this.playerMotion = stepMotion(base, cmd.move, dt, this.content.map, {
        moveSpeed: p.stats.speed * p.speedMultiplier,
        colliderHalfSize: p.colliderHalfSize,
      });
      p.position = this.playerMotion.position;
    } else {
      this.playerMotion = { ...this.playerMotion, moving: p.dash !== null };
    }
  }

  private updateCreatures(dt: number): void {
    const target = this.player.alive ? this.player : null;
    for (const c of this.creatures.values()) {
      const self = c.combatant;
      if (!self.alive || distance(self.position, this.player.position) > ACTIVE_RADIUS) continue;
      const decision = c.brain.decide(self, target, this.time, this.rng);
      if (decision.attack) {
        const used = this.combat.useAbility(self.id, c.ability, decision.attack);
        const facing = directionFromScreenVector(cellToScreen(decision.attack));
        c.motion = { ...c.motion, moving: false, facing: facing ?? c.motion.facing };
        if (used.ok) continue;
      }
      if (!self.canAct(this.time) || (decision.move.x === 0 && decision.move.y === 0)) {
        c.motion = { ...c.motion, moving: false };
        continue;
      }
      c.motion = stepMotionCells(c.motion, decision.move, dt, this.content.map, {
        moveSpeed: self.stats.speed * self.speedMultiplier * decision.speedFactor,
        colliderHalfSize: self.colliderHalfSize,
      });
      self.position = c.motion.position;
    }
  }

  private handleCombatEvent(e: CombatEvent): void {
    this.events.push(e);
    if (e.type !== 'death') return;
    if (e.targetId === PLAYER_ID) {
      this.playerRespawnAt = this.time + PLAYER_RESPAWN_SECONDS;
      this.events.push({ type: 'player-died' });
      return;
    }
    const c = this.creatures.get(e.targetId);
    if (!c) return;
    this.creatures.delete(c.id);
    this.combat.remove(c.id);
    if (e.killerId === PLAYER_ID) this.xp += c.def.xpReward;
    this.events.push({
      type: 'defeated',
      id: c.id,
      creatureId: c.def.id,
      xp: e.killerId === PLAYER_ID ? c.def.xpReward : 0,
      lootTable: c.def.lootTable,
      position: c.combatant.position,
    });
    const zone = this.content.map.spawnZones.find((z) => z.id === c.zoneId);
    if (zone) this.respawns.push({ zone, at: this.time + c.def.spawnRules.respawnSeconds });
  }

  private processRespawns(): void {
    if (this.playerRespawnAt !== null && this.time >= this.playerRespawnAt) {
      this.playerRespawnAt = null;
      this.player.reset(this.content.map.spawn);
      this.playerMotion = { position: this.player.position, facing: 's', moving: false };
      this.events.push({ type: 'player-respawned' });
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (!r || this.time < r.at) continue;
      // Si no hay sitio válido (p. ej. el jugador está encima), se reintenta más tarde.
      if (this.spawnCreature(r.zone)) this.respawns.splice(i, 1);
      else r.at = this.time + 1;
    }
  }

  private findSpawnPoint(zone: SpawnZone, def: CreatureDefinition): Vec2 | null {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * zone.radius;
      const p = { x: zone.center.x + Math.cos(angle) * r, y: zone.center.y + Math.sin(angle) * r };
      if (collides(this.content.map, p, { halfSize: def.colliderHalfSize })) continue;
      if (distance(p, this.player.position) < SPAWN_SAFE_DISTANCE) continue;
      return p;
    }
    return null;
  }

  private spawnCreature(zone: SpawnZone): boolean {
    const def = this.content.creatures.get(zone.creatureId);
    const position = this.findSpawnPoint(zone, def);
    if (!position) return false;
    const id = `${zone.id}#${++this.serial}`;
    const combatant = new Combatant({
      id,
      team: 'hostile',
      position,
      stats: def.stats,
      level: def.levelRange[0],
      hurtboxRadius: def.hurtboxRadius,
      colliderHalfSize: def.colliderHalfSize,
      invulnerabilityOnHit: 0,
      poise: def.poise,
      energyRegen: 0,
    });
    this.combat.add(combatant);
    this.creatures.set(id, {
      id,
      def,
      zoneId: zone.id,
      combatant,
      brain: new CreatureBrain(position, def.behavior, new Navigator(this.content.map, def.colliderHalfSize)),
      ability: this.content.abilities.get(def.abilities[0] as string),
      motion: { position, facing: 's', moving: false },
    });
    this.events.push({ type: 'spawned', id, creatureId: def.id });
    return true;
  }
}

/** Comprueba referencias cruzadas entre los archivos de contenido. */
export function validateContentReferences(content: SimulationContent): string[] {
  const problems: string[] = [];
  const { abilities, statuses, creatures, profession, character, map } = content;
  if (character.professionId !== profession.id)
    problems.push(`El personaje usa la profesión "${character.professionId}" pero se cargó "${profession.id}"`);
  for (const [slot, id] of Object.entries(profession.abilities)) {
    if (!abilities.all.has(id)) problems.push(`Profesión ${profession.id}.${slot}: habilidad "${id}" inexistente`);
  }
  for (const a of abilities.all.values()) {
    if (a.applyStatus && !statuses.all.has(a.applyStatus.statusId))
      problems.push(`Habilidad ${a.id}: estado "${a.applyStatus.statusId}" inexistente`);
  }
  for (const c of creatures.all.values()) {
    for (const id of c.abilities) if (!abilities.all.has(id)) problems.push(`Criatura ${c.id}: habilidad "${id}" inexistente`);
  }
  for (const z of map.spawnZones) {
    if (!creatures.all.has(z.creatureId)) problems.push(`Mapa ${map.id}, zona ${z.id}: criatura "${z.creatureId}" inexistente`);
  }
  return problems;
}
