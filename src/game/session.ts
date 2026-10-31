import type { CharacterConfig } from '../core/data/characterConfig.ts';
import type { MotionState } from '../core/movement/characterMotion.ts';
import type { Vec2 } from '../core/math/vector.ts';
import { ExplorationState } from '../core/world/exploration.ts';
import type { WorldMap } from '../core/world/worldMap.ts';

type RevealListener = (cells: readonly Vec2[]) => void;

/**
 * Estado de la partida en curso, compartido entre la escena de juego y el HUD.
 * Contiene solo datos y reglas; no conoce Phaser.
 */
export class GameSession {
  readonly map: WorldMap;
  readonly character: CharacterConfig;
  readonly exploration: ExplorationState;
  player: MotionState;
  private readonly revealListeners = new Set<RevealListener>();

  constructor(map: WorldMap, character: CharacterConfig) {
    this.map = map;
    this.character = character;
    this.exploration = new ExplorationState(map.width, map.height);
    this.player = { position: map.spawn, facing: 's', moving: false };
    this.exploration.reveal(map.spawn, character.visionRadius);
  }

  /** Actualiza el estado del jugador y la niebla de exploración. */
  setPlayer(state: MotionState): void {
    this.player = state;
    const revealed = this.exploration.reveal(state.position, this.character.visionRadius);
    if (revealed.length > 0) this.revealListeners.forEach((l) => { l(revealed); });
  }

  onReveal(listener: RevealListener): () => void {
    this.revealListeners.add(listener);
    return () => this.revealListeners.delete(listener);
  }
}
