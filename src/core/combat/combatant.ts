import type { Vec2 } from '../math/vector.ts';
import type { Stats } from './stats.ts';
import type { ActiveStatus } from './statusEffects.ts';

/** player = jugador; hostile = enemigos; wild = fauna (GAME_DESIGN §8). */
export type Team = 'player' | 'hostile' | 'wild';

export interface CombatantInit {
  readonly id: string;
  readonly team: Team;
  readonly position: Vec2;
  readonly stats: Stats;
  readonly level: number;
  readonly hurtboxRadius: number;
  readonly colliderHalfSize: number;
  /** Segundos de invulnerabilidad tras recibir un impacto. */
  readonly invulnerabilityOnHit: number;
  /**
   * Aplomo: un impacto cuyo retroceso sea ≥ este valor cancela su ataque en preparación.
   * 0 = cualquier retroceso interrumpe; Infinity = nunca se interrumpe.
   */
  readonly poise: number;
  /** Energía recuperada por segundo. */
  readonly energyRegen: number;
}

interface TimedMotion {
  readonly velocity: Vec2;
  remaining: number;
}

/**
 * Estado mutable de una entidad en combate. Solo contiene datos y consultas simples;
 * las reglas viven en CombatWorld.
 */
export class Combatant {
  readonly id: string;
  readonly team: Team;
  readonly hurtboxRadius: number;
  readonly colliderHalfSize: number;
  readonly invulnerabilityOnHit: number;
  readonly poise: number;
  readonly energyRegen: number;
  stats: Stats;
  level: number;
  position: Vec2;
  /** Última dirección de apuntado (celdas, normalizada). */
  aim: Vec2 = { x: 1, y: 0 };
  hp: number;
  energy: number;
  alive = true;
  /** Momento (tiempo del mundo) en que cada habilidad vuelve a estar disponible. */
  readonly cooldowns = new Map<string, number>();
  readonly statuses = new Map<string, ActiveStatus>();
  invulnerableUntil = 0;
  /** Bloqueo de acciones mientras dura una habilidad. */
  busyUntil = 0;
  dash: (TimedMotion & { readonly invulnerable: boolean }) | null = null;
  knockback: TimedMotion | null = null;

  constructor(init: CombatantInit) {
    this.id = init.id;
    this.team = init.team;
    this.position = init.position;
    this.stats = init.stats;
    this.level = init.level;
    this.hurtboxRadius = init.hurtboxRadius;
    this.colliderHalfSize = init.colliderHalfSize;
    this.invulnerabilityOnHit = init.invulnerabilityOnHit;
    this.poise = init.poise;
    this.energyRegen = init.energyRegen;
    this.hp = init.stats.life;
    this.energy = init.stats.energy;
  }

  private product(kind: 'speedMultiplier' | 'damageTakenMultiplier'): number {
    let m = 1;
    for (const s of this.statuses.values()) if (s.def.kind === kind) m *= s.def.magnitude;
    return m;
  }

  get speedMultiplier(): number {
    return this.product('speedMultiplier');
  }

  get damageTakenMultiplier(): number {
    return this.product('damageTakenMultiplier');
  }

  isInvulnerable(time: number): boolean {
    return time < this.invulnerableUntil || (this.dash?.invulnerable ?? false);
  }

  /** Puede moverse por voluntad propia (no está lanzando, esquivando ni siendo empujado). */
  canAct(time: number): boolean {
    return this.alive && time >= this.busyUntil && this.dash === null && this.knockback === null;
  }

  cooldownRemaining(abilityId: string, time: number): number {
    return Math.max(0, (this.cooldowns.get(abilityId) ?? 0) - time);
  }

  /** Restaura vida, energía y estados (reaparición). */
  reset(position: Vec2): void {
    this.position = position;
    this.hp = this.stats.life;
    this.energy = this.stats.energy;
    this.alive = true;
    this.statuses.clear();
    this.cooldowns.clear();
    this.dash = null;
    this.knockback = null;
    this.busyUntil = 0;
    this.invulnerableUntil = 0;
  }
}
