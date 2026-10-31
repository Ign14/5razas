import type { Combatant } from '../combat/combatant.ts';
import type { CreatureBehavior } from '../creatures/creatureCatalog.ts';
import type { Rng } from '../math/random.ts';
import { distance, normalize, sub, ZERO, type Vec2 } from '../math/vector.ts';
import type { Navigator } from './navigator.ts';

export type BrainState = 'idle' | 'wander' | 'chase' | 'return';

export interface BrainDecision {
  /** Dirección de movimiento en celdas (normalizada) o (0,0). */
  readonly move: Vec2;
  /** Factor de velocidad (deambular es más lento). */
  readonly speedFactor: number;
  /** Si debe intentar su ataque, y hacia dónde. */
  readonly attack: Vec2 | null;
}

const ARRIVE = 0.4;

/** IA básica de criatura agresiva: deambula, persigue, ataca y regresa a su zona. */
export class CreatureBrain {
  state: BrainState = 'idle';
  readonly home: Vec2;
  private wanderTarget: Vec2 | null = null;
  private nextWanderAt = 0;
  private readonly behavior: CreatureBehavior;
  private readonly nav: Navigator | null;

  /** Sin navegador, la criatura se mueve en línea recta (útil en pruebas de campo abierto). */
  constructor(home: Vec2, behavior: CreatureBehavior, nav: Navigator | null = null) {
    this.home = home;
    this.behavior = behavior;
    this.nav = nav;
  }

  private toward(from: Vec2, to: Vec2, time: number): Vec2 {
    return this.nav ? this.nav.directionTo(from, to, time) : normalize(sub(to, from));
  }

  decide(self: Combatant, target: Combatant | null, time: number, rng: Rng): BrainDecision {
    const b = this.behavior;
    const idle: BrainDecision = { move: ZERO, speedFactor: 1, attack: null };
    if (!self.canAct(time)) return idle;

    const fromHome = distance(self.position, this.home);
    const targetValid =
      target !== null &&
      target.alive &&
      distance(target.position, this.home) <= b.leashRadius &&
      fromHome <= b.leashRadius;

    if (this.state === 'return') {
      if (fromHome <= ARRIVE) {
        this.state = 'idle';
        self.hp = self.stats.life; // Se recupera al volver a su zona.
        return idle;
      }
      const back = this.toward(self.position, this.home, time);
      // Sin ruta posible de regreso: se rinde y se queda donde está, para no quedar atrapada.
      if (back.x === 0 && back.y === 0) this.state = 'idle';
      return { move: back, speedFactor: 1, attack: null };
    }

    if (this.state === 'chase' && !targetValid) {
      this.state = 'return';
      return { move: this.toward(self.position, this.home, time), speedFactor: 1, attack: null };
    }

    if (target && targetValid && (this.state === 'chase' || distance(self.position, target.position) <= b.aggroRadius)) {
      this.state = 'chase';
      const toTarget = sub(target.position, self.position);
      const dist = distance(self.position, target.position);
      const aim = normalize(toTarget);
      if (dist <= b.attackRange) return { move: ZERO, speedFactor: 1, attack: aim };
      return { move: this.toward(self.position, target.position, time), speedFactor: 1, attack: null };
    }

    // Deambular alrededor del hogar.
    if (this.wanderTarget && distance(self.position, this.wanderTarget) > ARRIVE && time < this.nextWanderAt + 6) {
      this.state = 'wander';
      return { move: this.toward(self.position, this.wanderTarget, time), speedFactor: 0.45, attack: null };
    }
    this.state = 'idle';
    this.wanderTarget = null;
    if (time >= this.nextWanderAt && b.wanderRadius > 0) {
      const angle = rng() * Math.PI * 2;
      const r = rng() * b.wanderRadius;
      this.wanderTarget = { x: this.home.x + Math.cos(angle) * r, y: this.home.y + Math.sin(angle) * r };
      this.nextWanderAt = time + 2 + rng() * 3;
    }
    return idle;
  }
}
