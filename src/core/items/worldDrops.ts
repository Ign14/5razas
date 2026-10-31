import type { Rng } from '../math/random.ts';
import type { Vec2 } from '../math/vector.ts';
import type { CollisionMap } from '../world/collision.ts';
import type { Inventory } from './inventory.ts';

export interface WorldDrop {
  readonly id: string;
  readonly itemId: string;
  quantity: number;
  readonly position: Vec2;
  readonly expiresAt: number;
}

/** Radio (celdas) en que el jugador recoge automáticamente los objetos del suelo. */
export const PICKUP_RADIUS = 0.9;
/** Segundos que un objeto permanece en el suelo. */
export const DROP_LIFETIME = 90;

/** Objetos soltados en el mundo, a la espera de ser recogidos. */
export class DropField {
  private readonly drops = new Map<string, WorldDrop>();
  private serial = 0;

  all(): IterableIterator<WorldDrop> {
    return this.drops.values();
  }

  get size(): number {
    return this.drops.size;
  }

  /** Coloca un objeto cerca de `origin`, en una celda transitable. */
  spawn(itemId: string, quantity: number, origin: Vec2, now: number, map: CollisionMap, rng: Rng): WorldDrop {
    let position = origin;
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = rng() * Math.PI * 2;
      const r = 0.3 + rng() * 0.5;
      const p = { x: origin.x + Math.cos(a) * r, y: origin.y + Math.sin(a) * r };
      if (!map.isBlocked(Math.floor(p.x), Math.floor(p.y))) {
        position = p;
        break;
      }
    }
    const drop: WorldDrop = { id: `drop-${++this.serial}`, itemId, quantity, position, expiresAt: now + DROP_LIFETIME };
    this.drops.set(drop.id, drop);
    return drop;
  }

  /**
   * Recoge lo que esté al alcance y quepa en el inventario.
   * Devuelve lo recogido y los objetos que no cupieron (para avisar "inventario lleno").
   */
  collect(at: Vec2, inventory: Inventory): { collected: WorldDrop[]; blocked: WorldDrop[] } {
    const collected: WorldDrop[] = [];
    const blocked: WorldDrop[] = [];
    for (const d of this.drops.values()) {
      if (Math.hypot(d.position.x - at.x, d.position.y - at.y) > PICKUP_RADIUS) continue;
      const left = inventory.add(d.itemId, d.quantity);
      const taken = d.quantity - left;
      if (taken > 0) collected.push({ ...d, quantity: taken });
      if (left > 0) {
        d.quantity = left;
        blocked.push(d);
      } else {
        this.drops.delete(d.id);
      }
    }
    return { collected, blocked };
  }

  expire(now: number): WorldDrop[] {
    const gone: WorldDrop[] = [];
    for (const d of this.drops.values()) {
      if (now < d.expiresAt) continue;
      gone.push(d);
      this.drops.delete(d.id);
    }
    return gone;
  }
}
