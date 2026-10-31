import type { Vec2 } from '../math/vector.ts';

/** Niebla de exploración: registra qué celdas del sector ha descubierto el jugador. */
export class ExplorationState {
  private readonly explored: Uint8Array;
  private revealedCount = 0;

  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.explored = new Uint8Array(width * height);
  }

  isExplored(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.explored[y * this.width + x] === 1;
  }

  get exploredCount(): number {
    return this.revealedCount;
  }

  /**
   * Revela un círculo de celdas alrededor de la posición dada (en celdas).
   * Devuelve las celdas recién descubiertas, para redibujar solo lo necesario.
   */
  reveal(center: Vec2, radius: number): Vec2[] {
    const revealed: Vec2[] = [];
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(center.x - radius));
    const maxX = Math.min(this.width - 1, Math.floor(center.x + radius));
    const minY = Math.max(0, Math.floor(center.y - radius));
    const maxY = Math.min(this.height - 1, Math.floor(center.y + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - center.x;
        const dy = y + 0.5 - center.y;
        const i = y * this.width + x;
        if (dx * dx + dy * dy <= r2 && this.explored[i] === 0) {
          this.explored[i] = 1;
          this.revealedCount++;
          revealed.push({ x, y });
        }
      }
    }
    return revealed;
  }

  /** Restaura las celdas exploradas desde un guardado. */
  restore(bits: readonly number[]): void {
    if (bits.length !== this.explored.length) throw new Error('Tamaño de exploración incompatible');
    this.revealedCount = 0;
    bits.forEach((b, i) => {
      this.explored[i] = b ? 1 : 0;
      if (b) this.revealedCount++;
    });
  }

  /** Serialización compacta para el sistema de guardado. */
  toArray(): number[] {
    return Array.from(this.explored);
  }
}
