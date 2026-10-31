import { CreatureBrain } from '../ai/creatureBrain.ts';
import { Navigator } from '../ai/navigator.ts';
import { abilityReach, type AbilityCatalog, type AbilityDefinition } from '../combat/abilities.ts';
import { Combatant } from '../combat/combatant.ts';
import type { CombatWorld } from '../combat/combatWorld.ts';
import type { CreatureCatalog, CreatureDefinition } from '../creatures/creatureCatalog.ts';
import { cellToScreen } from '../math/iso.ts';
import type { Rng } from '../math/random.ts';
import { distance, normalize, sub, type Vec2 } from '../math/vector.ts';
import { stepMotionCells, type MotionState } from '../movement/characterMotion.ts';
import { directionFromScreenVector } from '../movement/direction.ts';
import { statsAtLevel } from '../progression/progression.ts';
import { collides } from '../world/collision.ts';
import type { DynamicObstacles, Obstacle } from '../world/dynamicObstacles.ts';
import { inHourRange } from '../world/worldClock.ts';
import type { SpawnZone, WorldMap } from '../world/worldMap.ts';

export interface BossState {
  phase: number;
  nextObstaclesAt: number;
}

export interface CreatureInstance {
  readonly id: string;
  readonly def: CreatureDefinition;
  readonly zoneId: string;
  readonly combatant: Combatant;
  readonly brain: CreatureBrain;
  readonly level: number;
  /** Estado de fases si es un jefe. */
  readonly boss: BossState | null;
  motion: MotionState;
}

export type PopulationEvent =
  | { readonly type: 'spawned'; readonly id: string; readonly creatureId: string }
  | { readonly type: 'despawned'; readonly id: string }
  | { readonly type: 'boss-phase'; readonly id: string; readonly phase: number; readonly name: string }
  | { readonly type: 'obstacle-spawned'; readonly obstacle: Obstacle }
  | { readonly type: 'obstacle-removed'; readonly obstacle: Obstacle };

/** Las criaturas más lejanas que esto (celdas) no ejecutan IA (GAME_DESIGN §14). */
export const ACTIVE_RADIUS = 22;
/** Distancia mínima al jugador para hacer aparecer criaturas. */
const SPAWN_SAFE_DISTANCE = 6;
/** Cada cuánto se revisa qué criaturas salen de su horario. */
const SCHEDULE_CHECK_SECONDS = 1;

export interface PopulationDeps {
  readonly map: WorldMap;
  /** Capa de colisión con obstáculos temporales; la usan IA y movimiento. */
  readonly world: DynamicObstacles;
  readonly creatures: CreatureCatalog;
  readonly abilities: AbilityCatalog;
  readonly combat: CombatWorld;
  readonly rng: Rng;
  readonly emit: (e: PopulationEvent) => void;
}

/**
 * Población de criaturas del sector: aparición por zonas y horarios, reaparición, IA, selección de
 * habilidades por alcance y fases de jefe (GAME_DESIGN §8–9).
 */
export class CreaturePopulation {
  readonly creatures = new Map<string, CreatureInstance>();
  /** Jefes ya derrotados: no vuelven a aparecer (progreso de jefes, §15). */
  readonly defeatedBosses = new Set<string>();
  private readonly deps: PopulationDeps;
  private readonly respawns: { zone: SpawnZone; at: number }[] = [];
  private serial = 0;
  private nextScheduleCheck = 0;

  constructor(deps: PopulationDeps) {
    this.deps = deps;
  }

  /** Puebla todas las zonas; lo que no puede aparecer ahora queda pendiente. */
  spawnInitial(hour: number, player: Vec2): void {
    for (const zone of this.deps.map.spawnZones) {
      for (let i = 0; i < zone.count; i++) {
        if (!this.spawn(zone, hour, player)) this.respawns.push({ zone, at: 0 });
      }
    }
  }

  get(id: string): CreatureInstance | undefined {
    return this.creatures.get(id);
  }

  /** Abilidades disponibles ahora (las de la fase actual si es un jefe). */
  abilitiesOf(c: CreatureInstance): readonly AbilityDefinition[] {
    const ids = c.boss ? (c.def.boss?.phases[c.boss.phase]?.abilities ?? []) : c.def.abilities;
    return ids.map((id) => this.deps.abilities.get(id));
  }

  update(dt: number, target: Combatant | null, playerPos: Vec2, time: number, rng: Rng): void {
    const { combat, world } = this.deps;
    for (const c of this.creatures.values()) {
      const self = c.combatant;
      if (!self.alive || distance(self.position, playerPos) > ACTIVE_RADIUS) continue;
      if (c.boss) this.updateBoss(c, target, time);
      const decision = c.brain.decide(self, target, time, rng);
      // Tras decidir (el estado ya refleja si fue provocado), un jefe ocioso y herido se reinicia.
      if (c.boss) this.resetBossIfIdle(c, time);
      if (decision.face) {
        c.motion = { ...c.motion, moving: false, facing: directionFromScreenVector(cellToScreen(decision.face)) ?? c.motion.facing };
      }
      // Ataque: la IA lo pide en su alcance; en persecución, se prueba también una habilidad de mayor alcance.
      const engaged = target !== null && (decision.attack !== null || c.brain.state === 'chase');
      if (engaged) {
        const dist = distance(self.position, target.position);
        const ability = this.abilitiesOf(c).find((a) => abilityReach(a) >= dist && self.cooldownRemaining(a.id, time) === 0);
        if (ability) {
          const aim = normalize(sub(target.position, self.position));
          if (combat.useAbility(self.id, ability, aim).ok) {
            this.scaleCooldown(c, ability, time);
            c.motion = { ...c.motion, moving: false, facing: directionFromScreenVector(cellToScreen(aim)) ?? c.motion.facing };
            continue;
          }
        }
      }
      if (!self.canAct(time) || (decision.move.x === 0 && decision.move.y === 0)) {
        c.motion = { ...c.motion, moving: false };
        continue;
      }
      c.motion = stepMotionCells(c.motion, decision.move, dt, world, {
        moveSpeed: self.stats.speed * self.speedMultiplier * decision.speedFactor,
        colliderHalfSize: self.colliderHalfSize,
      });
      self.position = c.motion.position;
    }
  }

  /** Sincroniza la posición visual con la autoritativa (tras dash o retroceso). */
  syncMotion(): void {
    for (const c of this.creatures.values()) c.motion = { ...c.motion, position: c.combatant.position };
  }

  private scaleCooldown(c: CreatureInstance, ability: AbilityDefinition, time: number): void {
    const mult = c.boss ? (c.def.boss?.phases[c.boss.phase]?.cooldownMultiplier ?? 1) : 1;
    if (mult !== 1) c.combatant.cooldowns.set(ability.id, time + ability.cooldown * mult);
  }

  /**
   * Fuera de combate (sin perseguir ni regresar), un jefe herido se reinicia: vida completa y primera
   * fase. Así, si el jugador cae o huye, el enfrentamiento vuelve a empezar.
   */
  private resetBossIfIdle(c: CreatureInstance, time: number): void {
    const cfg = c.def.boss;
    const state = c.boss;
    if (!cfg || !state || c.brain.state === 'chase' || c.brain.state === 'return') return;
    // Durante una transición o un ataque la IA no actualiza su estado: no es "estar ocioso".
    if (!c.combatant.canAct(time)) return;
    if (state.phase === 0 && c.combatant.hp >= c.combatant.stats.life) return;
    state.phase = 0;
    c.combatant.stats = statsAtLevel(c.def.stats, c.def.statsPerLevel, c.level);
    c.combatant.hp = c.combatant.stats.life;
    c.combatant.statuses.clear();
    for (const o of this.deps.world.clear()) this.deps.emit({ type: 'obstacle-removed', obstacle: o });
    this.deps.emit({ type: 'boss-phase', id: c.id, phase: 0, name: cfg.phases[0]?.name ?? '' });
  }

  /** Cambia de fase según la vida y hace brotar obstáculos alrededor del jugador. */
  private updateBoss(c: CreatureInstance, target: Combatant | null, time: number): void {
    const cfg = c.def.boss;
    const state = c.boss;
    if (!cfg || !state) return;
    const ratio = c.combatant.hp / c.combatant.stats.life;
    let phase = state.phase;
    while (phase + 1 < cfg.phases.length && ratio <= (cfg.phases[phase + 1]?.hpBelow ?? 0)) phase++;
    if (phase !== state.phase) {
      state.phase = phase;
      const def = cfg.phases[phase];
      if (!def) return;
      const base = statsAtLevel(c.def.stats, c.def.statsPerLevel, c.level);
      c.combatant.stats = { ...c.combatant.stats, speed: base.speed * def.speedMultiplier };
      c.combatant.busyUntil = time + cfg.transitionSeconds;
      c.combatant.invulnerableUntil = time + cfg.transitionSeconds;
      state.nextObstaclesAt = time + cfg.transitionSeconds;
      this.deps.emit({ type: 'boss-phase', id: c.id, phase, name: def.name });
    }
    const obstacles = cfg.phases[state.phase]?.obstacles;
    if (obstacles && target && c.brain.state === 'chase' && time >= state.nextObstaclesAt) {
      state.nextObstaclesAt = time + obstacles.every;
      this.spawnObstacles(target.position, obstacles, time);
    }
  }

  private spawnObstacles(around: Vec2, cfg: { count: number; radius: number; duration: number }, time: number): void {
    const { world, rng } = this.deps;
    let placed = 0;
    for (let attempt = 0; attempt < cfg.count * 6 && placed < cfg.count; attempt++) {
      const a = rng() * Math.PI * 2;
      const r = 1.2 + rng() * (cfg.radius - 1.2);
      const x = Math.floor(around.x + Math.cos(a) * r);
      const y = Math.floor(around.y + Math.sin(a) * r);
      // No encerrar a nadie: la celda no puede contener al jugador ni a otra criatura.
      const occupied = [...this.creatures.values()].some((c) => Math.floor(c.combatant.position.x) === x && Math.floor(c.combatant.position.y) === y);
      if (occupied || (Math.floor(around.x) === x && Math.floor(around.y) === y)) continue;
      const o = world.add(x, y, time + cfg.duration);
      if (o) {
        placed++;
        this.deps.emit({ type: 'obstacle-spawned', obstacle: o });
      }
    }
  }

  /** Retira una criatura muerta; programa su reaparición salvo que sea un jefe. */
  removeDefeated(id: string, time: number): CreatureInstance | null {
    const c = this.creatures.get(id);
    if (!c) return null;
    this.creatures.delete(id);
    this.deps.combat.remove(id);
    if (c.def.category === 'boss') {
      this.defeatedBosses.add(c.def.id);
      for (const o of this.deps.world.clear()) this.deps.emit({ type: 'obstacle-removed', obstacle: o });
      return c;
    }
    const zone = this.deps.map.spawnZones.find((z) => z.id === c.zoneId);
    if (zone) this.respawns.push({ zone, at: time + c.def.spawnRules.respawnSeconds });
    return c;
  }

  /** Marca un jefe como derrotado (al cargar una partida) y lo retira si estaba presente. */
  markBossDefeated(creatureId: string): void {
    this.defeatedBosses.add(creatureId);
    for (const c of [...this.creatures.values()]) {
      if (c.def.id !== creatureId) continue;
      this.creatures.delete(c.id);
      this.deps.combat.remove(c.id);
      this.deps.emit({ type: 'despawned', id: c.id });
    }
  }

  /** Reapariciones pendientes, horarios y obstáculos vencidos. */
  maintain(time: number, hour: number, player: Vec2): void {
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (!r || time < r.at) continue;
      // Si no hay sitio válido (p. ej. el jugador está encima), se reintenta más tarde.
      if (this.spawn(r.zone, hour, player)) this.respawns.splice(i, 1);
      else r.at = time + 1;
    }
    for (const o of this.deps.world.expire(time)) this.deps.emit({ type: 'obstacle-removed', obstacle: o });
    if (time < this.nextScheduleCheck) return;
    this.nextScheduleCheck = time + SCHEDULE_CHECK_SECONDS;
    for (const c of [...this.creatures.values()]) {
      if (inHourRange(hour, c.def.spawnRules.activeHours)) continue;
      if (distance(c.combatant.position, player) <= ACTIVE_RADIUS) continue;
      this.creatures.delete(c.id);
      this.deps.combat.remove(c.id);
      this.deps.emit({ type: 'despawned', id: c.id });
      const zone = this.deps.map.spawnZones.find((z) => z.id === c.zoneId);
      if (zone) this.respawns.push({ zone, at: time + SCHEDULE_CHECK_SECONDS });
    }
  }

  private findSpawnPoint(zone: SpawnZone, def: CreatureDefinition, player: Vec2): Vec2 | null {
    const { map, rng } = this.deps;
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * zone.radius;
      const p = { x: zone.center.x + Math.cos(angle) * r, y: zone.center.y + Math.sin(angle) * r };
      if (collides(this.deps.world, p, { halfSize: def.colliderHalfSize })) continue;
      if (def.habitat.length > 0) {
        const cx = Math.floor(p.x);
        const cy = Math.floor(p.y);
        const ground = map.tileAt('ground', cx, cy);
        const detail = map.tileAt('detail', cx, cy);
        if (!def.habitat.some((t) => t === ground || t === detail)) continue;
      }
      if (distance(p, player) < SPAWN_SAFE_DISTANCE) continue;
      return p;
    }
    return null;
  }

  private spawn(zone: SpawnZone, hour: number, player: Vec2): boolean {
    const def = this.deps.creatures.get(zone.creatureId);
    if (this.defeatedBosses.has(def.id)) return true; // Nada que hacer: no reaparece.
    if (!inHourRange(hour, def.spawnRules.activeHours)) return false;
    const position = this.findSpawnPoint(zone, def, player);
    if (!position) return false;
    const { rng } = this.deps;
    const id = `${zone.id}#${++this.serial}`;
    const [minLevel, maxLevel] = def.levelRange;
    const level = minLevel + Math.floor(rng() * (maxLevel - minLevel + 1));
    const combatant = new Combatant({
      id,
      team: def.category === 'fauna' ? 'wild' : 'hostile',
      position,
      stats: statsAtLevel(def.stats, def.statsPerLevel, level),
      level,
      hurtboxRadius: def.hurtboxRadius,
      colliderHalfSize: def.colliderHalfSize,
      invulnerabilityOnHit: 0,
      poise: def.poise,
      energyRegen: 0,
    });
    this.deps.combat.add(combatant);
    this.creatures.set(id, {
      id,
      def,
      zoneId: zone.id,
      combatant,
      brain: new CreatureBrain(position, def.behavior, new Navigator(this.deps.world, def.colliderHalfSize)),
      level,
      boss: def.boss ? { phase: 0, nextObstaclesAt: 0 } : null,
      motion: { position, facing: 's', moving: false },
    });
    this.deps.emit({ type: 'spawned', id, creatureId: def.id });
    return true;
  }
}
