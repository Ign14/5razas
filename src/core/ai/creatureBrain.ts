import type { Combatant } from '../combat/combatant.ts';
import type { CreatureBehavior, FleeingBehavior } from '../creatures/creatureCatalog.ts';
import type { Rng } from '../math/random.ts';
import { add, distance, normalize, scale, sub, ZERO, type Vec2 } from '../math/vector.ts';
import type { Navigator } from './navigator.ts';

export type BrainState = 'idle' | 'wander' | 'alert' | 'flee' | 'chase' | 'return';

export interface BrainDecision {
  /** Dirección de movimiento en celdas (normalizada) o (0,0). */
  readonly move: Vec2;
  /** Factor de velocidad (deambular es más lento). */
  readonly speedFactor: number;
  /** Si debe intentar su ataque, y hacia dónde. */
  readonly attack: Vec2 | null;
  /** Dirección hacia la que mira sin moverse (p. ej. vigilando en estado de alerta). */
  readonly face?: Vec2;
}

const ARRIVE = 0.4;
/** Segundos que una criatura combativa persigue a quien la dañó aunque esté fuera de su rango habitual. */
const PROVOKED_SECONDS = 6;
/** Una criatura territorial deja de perseguir cuando el intruso se aleja este factor de su territorio. */
const TERRITORY_EXIT_FACTOR = 1.6;
const IDLE: BrainDecision = { move: ZERO, speedFactor: 1, attack: null };

/**
 * IA de criaturas (GAME_DESIGN §8 y §9): deambular, alerta, huida, persecución, ataque y regreso.
 * El comportamiento concreto se elige por datos (`behavior.type`).
 */
export class CreatureBrain {
  state: BrainState = 'idle';
  readonly home: Vec2;
  private wanderTarget: Vec2 | null = null;
  private nextWanderAt = 0;
  private provokedUntil = -Infinity;
  private fleeUntil = -Infinity;
  private readonly behavior: CreatureBehavior;
  private readonly nav: Navigator | null;

  /** Sin navegador, la criatura se mueve en línea recta (útil en pruebas de campo abierto). */
  constructor(home: Vec2, behavior: CreatureBehavior, nav: Navigator | null = null) {
    this.home = home;
    this.behavior = behavior;
    this.nav = nav;
  }

  /** La simulación avisa cuando la criatura recibe daño. */
  notifyDamaged(time: number): void {
    const b = this.behavior;
    if (b.type === 'fleeing') this.fleeUntil = time + b.fleeSeconds;
    else this.provokedUntil = time + (b.type === 'neutral' ? b.retaliateSeconds : PROVOKED_SECONDS);
  }

  private toward(from: Vec2, to: Vec2, time: number): Vec2 {
    return this.nav ? this.nav.directionTo(from, to, time) : normalize(sub(to, from));
  }

  decide(self: Combatant, target: Combatant | null, time: number, rng: Rng): BrainDecision {
    if (!self.canAct(time)) return IDLE;
    const threat = target?.alive ? target : null;
    return this.behavior.type === 'fleeing'
      ? this.decideFleeing(this.behavior, self, threat, time, rng)
      : this.decideCombat(self, threat, time, rng);
  }

  private decideFleeing(b: FleeingBehavior, self: Combatant, threat: Combatant | null, time: number, rng: Rng): BrainDecision {
    const dist = threat ? distance(self.position, threat.position) : Infinity;
    if (threat && dist <= b.fleeRadius && time >= this.fleeUntil) this.fleeUntil = time + b.fleeSeconds;
    if (threat && time < this.fleeUntil) {
      this.state = 'flee';
      const away = normalize(sub(self.position, threat.position));
      const goal = add(self.position, scale(away.x === 0 && away.y === 0 ? { x: 1, y: 0 } : away, 4));
      return { move: this.toward(self.position, goal, time), speedFactor: 1, attack: null };
    }
    if (threat && dist <= b.alertRadius) {
      this.state = 'alert';
      this.wanderTarget = null;
      return { ...IDLE, face: normalize(sub(threat.position, self.position)) };
    }
    return this.wander(self, time, rng);
  }

  private decideCombat(self: Combatant, threat: Combatant | null, time: number, rng: Rng): BrainDecision {
    const b = this.behavior;
    if (b.type === 'fleeing') return IDLE;
    const fromHome = distance(self.position, this.home);
    const provoked = time < this.provokedUntil;

    if (this.state === 'return') {
      if (fromHome <= ARRIVE) {
        this.state = 'idle';
        self.hp = self.stats.life; // Se recupera al volver a su zona.
        return IDLE;
      }
      const back = this.toward(self.position, this.home, time);
      // Sin ruta posible de regreso: se rinde y se queda donde está, para no quedar atrapada.
      if (back.x === 0 && back.y === 0) this.state = 'idle';
      return { move: back, speedFactor: 1, attack: null };
    }

    const withinLeash = threat !== null && distance(threat.position, this.home) <= b.leashRadius && fromHome <= b.leashRadius;
    let keepChasing = withinLeash;
    if (threat && b.type === 'territorial' && !provoked)
      keepChasing &&= distance(threat.position, this.home) <= b.territoryRadius * TERRITORY_EXIT_FACTOR;
    if (b.type === 'neutral') keepChasing &&= provoked;

    if (this.state === 'chase' && !keepChasing) {
      this.state = 'return';
      return { move: this.toward(self.position, this.home, time), speedFactor: 1, attack: null };
    }

    let engage = provoked;
    if (threat && b.type === 'aggressive') engage ||= distance(self.position, threat.position) <= b.aggroRadius;
    if (threat && b.type === 'territorial') engage ||= distance(threat.position, this.home) <= b.territoryRadius;

    if (threat && withinLeash && (this.state === 'chase' || engage)) {
      this.state = 'chase';
      const dist = distance(self.position, threat.position);
      const aim = normalize(sub(threat.position, self.position));
      if (dist <= b.attackRange) return { move: ZERO, speedFactor: 1, attack: aim };
      return { move: this.toward(self.position, threat.position, time), speedFactor: 1, attack: null };
    }
    return this.wander(self, time, rng);
  }

  private wander(self: Combatant, time: number, rng: Rng): BrainDecision {
    if (this.wanderTarget && distance(self.position, this.wanderTarget) > ARRIVE && time < this.nextWanderAt + 6) {
      this.state = 'wander';
      return { move: this.toward(self.position, this.wanderTarget, time), speedFactor: 0.45, attack: null };
    }
    this.state = 'idle';
    this.wanderTarget = null;
    if (time >= this.nextWanderAt && this.behavior.wanderRadius > 0) {
      const angle = rng() * Math.PI * 2;
      const r = rng() * this.behavior.wanderRadius;
      this.wanderTarget = { x: this.home.x + Math.cos(angle) * r, y: this.home.y + Math.sin(angle) * r };
      this.nextWanderAt = time + 2 + rng() * 3;
    }
    return IDLE;
  }
}
