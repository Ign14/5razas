import Phaser from 'phaser';
import { mapScreenBounds } from '../../core/math/iso.ts';
import { intentFromInput } from '../../core/movement/direction.ts';
import { stepMotion } from '../../core/movement/characterMotion.ts';
import type { GameContent } from '../content.ts';
import { PlayerView } from '../entities/playerView.ts';
import { KeyboardMoveInput, parseMoveBindings } from '../input/keyboardMoveInput.ts';
import { WorldRenderer } from '../rendering/worldRenderer.ts';
import { GameSession } from '../session.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

/** Escena de exploración: orquesta entrada → reglas (core) → representación. */
export class GameScene extends Phaser.Scene {
  private session!: GameSession;
  private input$!: KeyboardMoveInput;
  private playerView!: PlayerView;

  constructor() {
    super(SceneKeys.Game);
  }

  create(): void {
    const content = this.registry.get(REGISTRY_CONTENT) as GameContent;
    const map = content.startingMap;
    this.session = new GameSession(map, content.player);

    new WorldRenderer(this, map);
    this.playerView = new PlayerView(this, this.session.player, map.iso);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('El teclado no está disponible');
    this.input$ = new KeyboardMoveInput(keyboard, parseMoveBindings(content.controlsRaw));

    const camera = this.cameras.main;
    camera.setBackgroundColor('#0d0f14');
    const b = mapScreenBounds(map.width, map.height, map.iso);
    camera.setBounds(b.x, b.y - 64, b.width, b.height + 96);
    camera.startFollow(this.playerView.sprite, true, 0.15, 0.15);
    camera.setRoundPixels(true);

    this.scene.launch(SceneKeys.Hud, { session: this.session });
    exposeDebug(this.session);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SceneKeys.Hud);
    });
  }

  override update(_time: number, deltaMs: number): void {
    const intent = intentFromInput(this.input$.read());
    const next = stepMotion(this.session.player, intent, deltaMs / 1000, this.session.map, this.session.character);
    this.session.setPlayer(next);
    this.playerView.sync(next);
  }
}

/** Gancho de solo lectura para pruebas E2E y depuración manual desde la consola. */
function exposeDebug(session: GameSession): void {
  window.__5RAZAS__ = {
    player: () => ({ ...session.player.position, facing: session.player.facing, moving: session.player.moving }),
    exploredCells: () => session.exploration.exploredCount,
    mapId: session.map.id,
  };
}
