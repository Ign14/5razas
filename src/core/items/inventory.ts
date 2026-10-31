import type { ItemCatalog } from './itemCatalog.ts';

export interface ItemStack {
  readonly itemId: string;
  readonly quantity: number;
}

/** Inventario por ranuras con apilamiento según `maxStack` (GAME_DESIGN §11). */
export class Inventory {
  readonly capacity: number;
  private readonly catalog: ItemCatalog;
  private readonly slots: (ItemStack | null)[];

  constructor(capacity: number, catalog: ItemCatalog) {
    this.capacity = capacity;
    this.catalog = catalog;
    this.slots = new Array<ItemStack | null>(capacity).fill(null);
  }

  get contents(): readonly (ItemStack | null)[] {
    return this.slots;
  }

  at(index: number): ItemStack | null {
    return this.slots[index] ?? null;
  }

  count(itemId: string): number {
    return this.slots.reduce((n, s) => n + (s?.itemId === itemId ? s.quantity : 0), 0);
  }

  /** Cuántas unidades caben sin modificar el inventario. */
  spaceFor(itemId: string): number {
    const max = this.catalog.get(itemId).maxStack;
    return this.slots.reduce((n, s) => n + (s === null ? max : s.itemId === itemId ? max - s.quantity : 0), 0);
  }

  /** Agrega unidades completando pilas y luego ranuras vacías. Devuelve lo que no cupo. */
  add(itemId: string, quantity: number): number {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError(`Cantidad inválida: ${quantity}`);
    const max = this.catalog.get(itemId).maxStack;
    let left = quantity;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (s?.itemId !== itemId || s.quantity >= max) continue;
      const moved = Math.min(left, max - s.quantity);
      this.slots[i] = { itemId, quantity: s.quantity + moved };
      left -= moved;
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i] !== null) continue;
      const moved = Math.min(left, max);
      this.slots[i] = { itemId, quantity: moved };
      left -= moved;
    }
    return left;
  }

  /** Quita unidades (desde las últimas pilas). Falla sin cambios si no hay suficientes. */
  remove(itemId: string, quantity: number): boolean {
    if (this.count(itemId) < quantity) return false;
    let left = quantity;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s?.itemId !== itemId) continue;
      const taken = Math.min(left, s.quantity);
      this.slots[i] = s.quantity - taken > 0 ? { itemId, quantity: s.quantity - taken } : null;
      left -= taken;
    }
    return true;
  }

  /** Quita unidades de una ranura concreta. */
  removeAt(index: number, quantity: number): ItemStack | null {
    const s = this.slots[index];
    if (!s || quantity <= 0 || quantity > s.quantity) return null;
    this.slots[index] = s.quantity - quantity > 0 ? { itemId: s.itemId, quantity: s.quantity - quantity } : null;
    return { itemId: s.itemId, quantity };
  }

  /** Intercambia dos ranuras (reordenar desde la interfaz). */
  swap(a: number, b: number): void {
    if (a < 0 || b < 0 || a >= this.capacity || b >= this.capacity) return;
    const tmp = this.slots[a] ?? null;
    this.slots[a] = this.slots[b] ?? null;
    this.slots[b] = tmp;
  }

  /** Restaura las ranuras desde un guardado (los objetos desconocidos se descartan). */
  restore(slots: readonly (ItemStack | null)[]): void {
    for (let i = 0; i < this.capacity; i++) {
      const s = slots[i] ?? null;
      this.slots[i] = s && this.catalog.all.has(s.itemId) ? { itemId: s.itemId, quantity: Math.min(s.quantity, this.catalog.get(s.itemId).maxStack) } : null;
    }
  }

  /** Serialización para el guardado (Fase 6). */
  toJSON(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? { ...s } : null));
  }
}
