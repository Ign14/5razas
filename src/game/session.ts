import type { CharacterConfig } from '../core/data/characterConfig.ts';
import type { Vec2 } from '../core/math/vector.ts';
import { createSave, decodeBits, encodeBits, type SaveData, type SavePayload, type SaveStorage } from '../core/persistence/saveGame.ts';
import {
  WorldSimulation,
  type PlayerCommand,
  type SimEvent,
  type SimulationContent,
} from '../core/simulation/worldSimulation.ts';
import { ExplorationState } from '../core/world/exploration.ts';
import type { WorldMap } from '../core/world/worldMap.ts';

type RevealListener = (cells: readonly Vec2[]) => void;
type EventListener = (event: SimEvent) => void;

/** Segundos de juego entre guardados automáticos. */
export const AUTOSAVE_SECONDS = 60;

/**
 * Partida en curso, compartida entre la escena de juego y el HUD.
 * Envuelve la simulación (reglas), la exploración y el guardado; no conoce Phaser.
 */
export class GameSession {
  readonly map: WorldMap;
  readonly character: CharacterConfig;
  readonly exploration: ExplorationState;
  readonly sim: WorldSimulation;
  /** Con una pantalla superpuesta abierta la simulación no avanza. */
  paused = false;
  /** Advertencias de la última carga (referencias descartadas). */
  readonly loadWarnings: readonly string[];
  private readonly storage: SaveStorage | null;
  private readonly slot: string;
  private nextAutosaveAt: number;
  private saving = false;
  private readonly revealListeners = new Set<RevealListener>();
  private readonly eventListeners = new Set<EventListener>();

  constructor(
    content: SimulationContent,
    options: { seed?: number; save?: SaveData | null; storage?: SaveStorage | null; slot?: string } = {},
  ) {
    this.map = content.map;
    this.character = content.character;
    this.sim = new WorldSimulation(content, options.seed ?? Date.now() >>> 0);
    this.exploration = new ExplorationState(this.map.width, this.map.height);
    this.storage = options.storage ?? null;
    this.slot = options.slot ?? 'slot1';
    let warnings: string[] = [];
    if (options.save) {
      warnings = this.sim.restore(options.save.payload);
      try {
        this.exploration.restore(decodeBits(options.save.payload.exploration, this.map.width * this.map.height));
      } catch {
        warnings.push('exploración dañada: se reinicia');
      }
    }
    this.loadWarnings = warnings;
    this.exploration.reveal(this.sim.player.position, this.character.visionRadius);
    this.nextAutosaveAt = this.sim.time + AUTOSAVE_SECONDS;
  }

  get player() {
    return this.sim.playerMotion;
  }

  update(dtSeconds: number, cmd: PlayerCommand): SimEvent[] {
    const events = this.sim.update(dtSeconds, cmd);
    const revealed = this.exploration.reveal(this.sim.player.position, this.character.visionRadius);
    if (revealed.length > 0) this.revealListeners.forEach((l) => { l(revealed); });
    for (const e of events) this.eventListeners.forEach((l) => { l(e); });
    // Guardado automático periódico y en hitos importantes.
    const milestone = events.some((e) => e.type === 'quest-turned-in' || e.type === 'boss-defeated' || e.type === 'level-up');
    if (milestone || this.sim.time >= this.nextAutosaveAt) void this.save('auto');
    return events;
  }

  /** Reenvía los eventos generados con el juego en pausa (acciones de inventario, diálogos). */
  flush(): SimEvent[] {
    const events = this.sim.drainEvents();
    for (const e of events) this.eventListeners.forEach((l) => { l(e); });
    return events;
  }

  payload(): SavePayload {
    return { ...this.sim.snapshot(), exploration: encodeBits(this.exploration.toArray()), settings: {} };
  }

  /** Guarda la partida. Devuelve false si no hay almacenamiento, el jugador está caído o falla la escritura. */
  async save(kind: 'manual' | 'auto'): Promise<boolean> {
    if (!this.storage || this.saving || !this.sim.player.alive) return false;
    this.saving = true;
    this.nextAutosaveAt = this.sim.time + AUTOSAVE_SECONDS;
    try {
      await this.storage.save(this.slot, createSave(this.payload(), new Date()));
      this.saveListeners.forEach((l) => { l(kind, true); });
      return true;
    } catch (error: unknown) {
      console.error(error);
      this.saveListeners.forEach((l) => { l(kind, false); });
      return false;
    } finally {
      this.saving = false;
    }
  }

  private readonly saveListeners = new Set<(kind: 'manual' | 'auto', ok: boolean) => void>();

  onSave(listener: (kind: 'manual' | 'auto', ok: boolean) => void): () => void {
    this.saveListeners.add(listener);
    return () => this.saveListeners.delete(listener);
  }

  onReveal(listener: RevealListener): () => void {
    this.revealListeners.add(listener);
    return () => this.revealListeners.delete(listener);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
}
