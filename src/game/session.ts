import type { CharacterConfig } from '../core/data/characterConfig.ts';
import type { Vec2 } from '../core/math/vector.ts';
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

/**
 * Partida en curso, compartida entre la escena de juego y el HUD.
 * Envuelve la simulación (reglas) y la exploración; no conoce Phaser.
 */
export class GameSession {
  readonly map: WorldMap;
  readonly character: CharacterConfig;
  readonly exploration: ExplorationState;
  readonly sim: WorldSimulation;
  private readonly revealListeners = new Set<RevealListener>();
  private readonly eventListeners = new Set<EventListener>();

  constructor(content: SimulationContent, seed = Date.now() >>> 0) {
    this.map = content.map;
    this.character = content.character;
    this.sim = new WorldSimulation(content, seed);
    this.exploration = new ExplorationState(this.map.width, this.map.height);
    this.exploration.reveal(this.map.spawn, this.character.visionRadius);
  }

  get player() {
    return this.sim.playerMotion;
  }

  update(dtSeconds: number, cmd: PlayerCommand): SimEvent[] {
    const events = this.sim.update(dtSeconds, cmd);
    const revealed = this.exploration.reveal(this.sim.player.position, this.character.visionRadius);
    if (revealed.length > 0) this.revealListeners.forEach((l) => { l(revealed); });
    for (const e of events) this.eventListeners.forEach((l) => { l(e); });
    return events;
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
