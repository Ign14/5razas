import type { Rng } from '../math/random.ts';
import { add, length, normalize, scale, sub, type Vec2 } from '../math/vector.ts';
import { moveWithCollisions, type CollisionMap } from '../world/collision.ts';
import type { AbilityDefinition } from './abilities.ts';
import type { Combatant } from './combatant.ts';
import { computeDamage } from './damage.ts';
import { overlapsHurtbox, type HitArea } from './hitShapes.ts';
import { effectiveDuration, type StatusCatalog } from './statusEffects.ts';

/** Duración del desplazamiento por retroceso. */
export const KNOCKBACK_DURATION = 0.15;

export type CombatEvent =
  | { readonly type: 'ability'; readonly casterId: string; readonly ability: AbilityDefinition; readonly origin: Vec2; readonly aim: Vec2 }
  | { readonly type: 'hit'; readonly casterId: string; readonly ability: AbilityDefinition; readonly area: HitArea }
  | { readonly type: 'damage'; readonly targetId: string; readonly sourceId: string; readonly amount: number; readonly crit: boolean; readonly statusId: string | null }
  | { readonly type: 'evade'; readonly targetId: string; readonly sourceId: string }
  | { readonly type: 'status'; readonly targetId: string; readonly statusId: string }
  | { readonly type: 'interrupted'; readonly targetId: string }
  | { readonly type: 'death'; readonly targetId: string; readonly killerId: string | null };

export type UseFailure = 'dead' | 'busy' | 'cooldown' | 'energy' | 'locked';
export type UseResult = { readonly ok: true } | { readonly ok: false; readonly reason: UseFailure };

interface PendingHit {
  readonly at: number;
  readonly casterId: string;
  readonly ability: AbilityDefinition;
  readonly aim: Vec2;
  /** Origen fijo (inicio del dash); si es null se usa la posición actual del lanzador. */
  readonly origin: Vec2 | null;
}

/**
 * Calcula el área de impacto de una habilidad. `dashOrigin` es el punto de partida del
 * desplazamiento, si lo hay; también sirve para previsualizar (telegrafiar) el ataque.
 */
export function resolveArea(
  ability: AbilityDefinition,
  casterPosition: Vec2,
  aim: Vec2,
  dashOrigin: Vec2 | null,
): HitArea | null {
  const { area } = ability;
  switch (area.shape) {
    case 'none':
      return null;
    case 'arc':
      return {
        shape: 'arc',
        center: casterPosition,
        dir: aim,
        radius: area.radius,
        halfAngle: ((area.angleDeg / 2) * Math.PI) / 180,
      };
    case 'circle':
      return { shape: 'circle', center: add(casterPosition, scale(aim, ability.range)), radius: area.radius };
    case 'line': {
      const from = dashOrigin ?? casterPosition;
      const travelled = dashOrigin ? length(sub(casterPosition, dashOrigin)) : 0;
      return { shape: 'line', from, dir: aim, length: travelled + area.length, halfWidth: area.width / 2 };
    }
  }
}

/** Área prevista al activar la habilidad (asume que el dash recorre su distancia completa). */
export function predictArea(ability: AbilityDefinition, origin: Vec2, aim: Vec2): HitArea | null {
  if (!ability.dash) return resolveArea(ability, origin, aim, null);
  return resolveArea(ability, add(origin, scale(aim, ability.dash.distance)), aim, origin);
}

/**
 * Simulación de combate en tiempo real, independiente de Phaser y determinista
 * (tiempo y aleatoriedad inyectados).
 */
export class CombatWorld {
  time = 0;
  private readonly combatants = new Map<string, Combatant>();
  private pending: PendingHit[] = [];
  private events: CombatEvent[] = [];
  private readonly map: CollisionMap;
  private readonly statuses: StatusCatalog;
  private readonly rng: Rng;

  constructor(map: CollisionMap, statuses: StatusCatalog, rng: Rng) {
    this.map = map;
    this.statuses = statuses;
    this.rng = rng;
  }

  add(c: Combatant): void {
    if (this.combatants.has(c.id)) throw new Error(`Combatiente duplicado: ${c.id}`);
    this.combatants.set(c.id, c);
  }

  remove(id: string): void {
    this.combatants.delete(id);
    this.pending = this.pending.filter((p) => p.casterId !== id);
  }

  get(id: string): Combatant | undefined {
    return this.combatants.get(id);
  }

  all(): IterableIterator<Combatant> {
    return this.combatants.values();
  }

  /** Devuelve y vacía los eventos acumulados. */
  drainEvents(): CombatEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Comprueba si la habilidad podría usarse ahora, sin consumir nada. */
  canUse(caster: Combatant, ability: AbilityDefinition): UseResult {
    if (!caster.alive) return { ok: false, reason: 'dead' };
    if (caster.level < ability.unlockLevel) return { ok: false, reason: 'locked' };
    if (!caster.canAct(this.time)) return { ok: false, reason: 'busy' };
    if (caster.cooldownRemaining(ability.id, this.time) > 0) return { ok: false, reason: 'cooldown' };
    if (caster.energy < ability.energyCost) return { ok: false, reason: 'energy' };
    return { ok: true };
  }

  useAbility(casterId: string, ability: AbilityDefinition, aimInput: Vec2): UseResult {
    const caster = this.combatants.get(casterId);
    if (!caster) return { ok: false, reason: 'dead' };
    const check = this.canUse(caster, ability);
    if (!check.ok) return check;

    const aim = length(aimInput) > 0 ? normalize(aimInput) : caster.aim;
    caster.aim = aim;
    caster.energy -= ability.energyCost;
    const cooldown = ability.category === 'basic' ? ability.cooldown / caster.stats.attackRate : ability.cooldown;
    caster.cooldowns.set(ability.id, this.time + cooldown);

    const origin = caster.position;
    let firstHit = this.time + ability.windup;
    if (ability.dash) {
      const { distance, duration, invulnerable } = ability.dash;
      caster.dash = { velocity: scale(aim, distance / duration), remaining: duration, invulnerable };
      firstHit = Math.max(firstHit, this.time + duration);
    }
    const lastHit = firstHit + Math.max(0, ability.hits - 1) * ability.hitInterval;
    caster.busyUntil = Math.max(caster.busyUntil, ability.hits > 0 ? lastHit : this.time + ability.windup);

    for (let i = 0; i < ability.hits; i++) {
      this.pending.push({
        at: firstHit + i * ability.hitInterval,
        casterId,
        ability,
        aim,
        origin: ability.dash ? origin : null,
      });
    }
    if (ability.applyStatus?.target === 'self' && this.rng() < ability.applyStatus.chance) {
      this.applyStatus(caster, ability.applyStatus.statusId, caster.id);
    }
    this.events.push({ type: 'ability', casterId, ability, origin, aim });
    return { ok: true };
  }

  update(dt: number): void {
    this.time += dt;
    for (const c of this.combatants.values()) {
      if (!c.alive) continue;
      c.energy = Math.min(c.stats.energy, c.energy + c.energyRegen * dt);
      this.updateForcedMotion(c, dt);
      this.updateStatuses(c, dt);
    }
    // Resolver impactos vencidos en orden temporal.
    const due = this.pending.filter((p) => p.at <= this.time).sort((a, b) => a.at - b.at);
    if (due.length > 0) {
      this.pending = this.pending.filter((p) => p.at > this.time);
      for (const hit of due) this.resolveHit(hit);
    }
  }

  private updateForcedMotion(c: Combatant, dt: number): void {
    for (const kind of ['dash', 'knockback'] as const) {
      const motion = c[kind];
      if (!motion) continue;
      const step = Math.min(dt, motion.remaining);
      c.position = moveWithCollisions(this.map, c.position, scale(motion.velocity, step), {
        halfSize: c.colliderHalfSize,
      }).position;
      motion.remaining -= step;
      if (motion.remaining <= 1e-9) c[kind] = null;
    }
  }

  private updateStatuses(c: Combatant, dt: number): void {
    for (const [id, s] of c.statuses) {
      s.remaining -= dt;
      if (s.def.kind === 'damageOverTime') {
        s.untilTick -= dt;
        while (s.untilTick <= 0 && c.alive) {
          s.untilTick += s.def.tickInterval;
          const amount = Math.max(1, Math.round(s.def.magnitude));
          this.events.push({ type: 'damage', targetId: c.id, sourceId: s.sourceId, amount, crit: false, statusId: id });
          this.applyDamage(c, amount, s.sourceId);
        }
      }
      if (s.remaining <= 0) c.statuses.delete(id);
    }
  }

  private applyStatus(target: Combatant, statusId: string, sourceId: string): void {
    const def = this.statuses.get(statusId);
    const duration = effectiveDuration(def, target.stats.resistance);
    // Reaplicar renueva la duración (sin acumulación).
    target.statuses.set(statusId, { def, remaining: duration, untilTick: def.tickInterval, sourceId });
    this.events.push({ type: 'status', targetId: target.id, statusId });
  }

  private resolveHit(hit: PendingHit): void {
    const caster = this.combatants.get(hit.casterId);
    if (!caster?.alive) return;
    const area = resolveArea(hit.ability, caster.position, hit.aim, hit.origin);
    if (!area) return;
    this.events.push({ type: 'hit', casterId: caster.id, ability: hit.ability, area });

    for (const target of this.combatants.values()) {
      if (!target.alive || target.team === caster.team || target.isInvulnerable(this.time)) continue;
      if (!overlapsHurtbox(area, target.position, target.hurtboxRadius)) continue;

      const result = computeDamage({
        attacker: caster.stats,
        defender: target.stats,
        damageType: hit.ability.damageType,
        multiplier: hit.ability.multiplier,
        damageTakenMultiplier: target.damageTakenMultiplier,
        rng: this.rng,
      });
      if (result.evaded) {
        this.events.push({ type: 'evade', targetId: target.id, sourceId: caster.id });
        continue;
      }
      this.events.push({
        type: 'damage',
        targetId: target.id,
        sourceId: caster.id,
        amount: result.amount,
        crit: result.crit,
        statusId: null,
      });
      target.invulnerableUntil = this.time + target.invulnerabilityOnHit;
      this.applyDamage(target, result.amount, caster.id);
      if (target.hp <= 0) continue; // Murió con este impacto.

      if (hit.ability.knockback > 0) {
        const away = sub(target.position, caster.position);
        const dir = length(away) > 1e-6 ? normalize(away) : hit.aim;
        target.knockback = { velocity: scale(dir, hit.ability.knockback / KNOCKBACK_DURATION), remaining: KNOCKBACK_DURATION };
        if (hit.ability.knockback >= target.poise) this.interrupt(target);
      }
      const st = hit.ability.applyStatus;
      if (st?.target === 'hit' && this.rng() < st.chance) this.applyStatus(target, st.statusId, caster.id);
    }
  }

  /** Cancela el ataque en preparación del objetivo (interrupción controlada). */
  private interrupt(target: Combatant): void {
    const before = this.pending.length;
    this.pending = this.pending.filter((p) => p.casterId !== target.id);
    if (this.pending.length !== before) {
      target.busyUntil = this.time;
      this.events.push({ type: 'interrupted', targetId: target.id });
    }
  }

  private applyDamage(target: Combatant, amount: number, sourceId: string): void {
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp > 0) return;
    target.alive = false;
    target.statuses.clear();
    target.dash = null;
    target.knockback = null;
    this.pending = this.pending.filter((p) => p.casterId !== target.id);
    this.events.push({ type: 'death', targetId: target.id, killerId: this.combatants.has(sourceId) ? sourceId : null });
  }
}
