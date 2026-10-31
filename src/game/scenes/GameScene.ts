import Phaser from 'phaser';
import { predictArea } from '../../core/combat/combatWorld.ts';
import { mapScreenBounds } from '../../core/math/iso.ts';
import { darknessAt } from '../../core/world/worldClock.ts';
import { ACTION_SLOTS } from '../../core/professions/profession.ts';
import { PLAYER_ID, type SimEvent } from '../../core/simulation/worldSimulation.ts';
import type { GameContent } from '../content.ts';
import { CreatureView } from '../entities/creatureView.ts';
import { DropView } from '../entities/dropView.ts';
import { PlantView } from '../entities/plantView.ts';
import { PlayerView } from '../entities/playerView.ts';
import { PlayerInput, parseBindings } from '../input/playerInput.ts';
import { CombatEffects } from '../rendering/combatEffects.ts';
import { OVERLAY_DEPTH } from '../rendering/depth.ts';
import { WorldRenderer } from '../rendering/worldRenderer.ts';
import { GameSession } from '../session.ts';
import type { InventoryScene } from './InventoryScene.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

/** Escena de exploración y combate: orquesta entrada → simulación (core) → representación. */
export class GameScene extends Phaser.Scene {
  private session!: GameSession;
  private playerInput!: PlayerInput;
  private playerView!: PlayerView;
  private effects!: CombatEffects;
  private world!: WorldRenderer;
  private readonly creatureViews = new Map<string, CreatureView>();
  private readonly dropViews = new Map<string, DropView>();
  private readonly plantViews = new Map<string, PlantView>();
  private night!: Phaser.GameObjects.Rectangle;
  private content!: GameContent;

  constructor() {
    super(SceneKeys.Game);
  }

  create(): void {
    const content = this.registry.get(REGISTRY_CONTENT) as GameContent;
    this.content = content;
    const map = content.map;
    this.session = new GameSession(content);
    this.creatureViews.clear();
    this.dropViews.clear();
    this.plantViews.clear();

    this.world = new WorldRenderer(this, map);
    this.effects = new CombatEffects(this, map.iso);
    for (const node of this.session.sim.plants.all()) this.plantViews.set(node.id, new PlantView(this, node, map.iso));
    this.playerView = new PlayerView(this, this.session.player, map.iso);
    // Oscuridad nocturna sobre el mundo (el HUD, en otra escena, no se oscurece).
    this.night = this.add
      .rectangle(0, 0, 4, 4, 0x0a1030, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH - 5);
    for (const c of this.session.sim.creatures.values()) this.creatureViews.set(c.id, new CreatureView(this, c, map.iso));
    this.playerInput = new PlayerInput(this, parseBindings(content.controlsRaw));

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
      this.scene.stop(SceneKeys.Inventory);
    });
  }

  override update(_time: number, deltaMs: number): void {
    const sim = this.session.sim;
    // La lectura se hace siempre, para consumir pulsaciones y clics hechos sobre el inventario.
    const cmd = this.playerInput.read(sim.player.position);
    if (this.playerInput.inventoryPressed()) this.toggleInventory();
    const events = this.session.paused ? this.session.flush() : this.session.update(deltaMs / 1000, cmd);
    for (const e of events) this.handleEvent(e);

    this.playerView.sync(this.session.player, sim.player, sim.time);
    this.world.updateOcclusion(sim.player.position);
    const hour = sim.hour;
    for (const [id, view] of this.plantViews) {
      const node = sim.plants.get(id);
      if (node) view.sync(sim.plants.isReady(node, sim.time, hour));
    }
    this.night.setSize(this.scale.width, this.scale.height).setFillStyle(0x0a1030, darknessAt(hour) * 0.5);
    for (const [id, view] of this.creatureViews) {
      const c = sim.creatures.get(id);
      if (c) view.sync(c, sim.time);
    }
  }

  private toggleInventory(): void {
    if (this.scene.isActive(SceneKeys.Inventory)) {
      (this.scene.get(SceneKeys.Inventory) as InventoryScene).close();
    } else if (this.session.sim.player.alive) {
      this.scene.launch(SceneKeys.Inventory, { session: this.session });
    }
  }

  private handleEvent(e: SimEvent): void {
    const sim = this.session.sim;
    switch (e.type) {
      case 'spawned': {
        const c = sim.creatures.get(e.id);
        if (c) this.creatureViews.set(e.id, new CreatureView(this, c, this.session.map.iso));
        break;
      }
      case 'ability': {
        // Telegrafía de ataques enemigos durante su preparación.
        if (e.casterId !== PLAYER_ID && e.ability.windup > 0) {
          const area = predictArea(e.ability, e.origin, e.aim);
          if (area) this.effects.showArea(area, e.ability.vfx, e.ability.windup, true);
          this.creatureViews.get(e.casterId)?.telegraph(sim.time + e.ability.windup);
        }
        break;
      }
      case 'hit':
        this.effects.showArea(e.area, e.ability.vfx, 0.18, false);
        break;
      case 'interrupted':
        this.creatureViews.get(e.targetId)?.clearTelegraph();
        this.floatAt(e.targetId, '¡Interrumpido!', '#f2d16b');
        break;
      case 'damage': {
        const isPlayer = e.targetId === PLAYER_ID;
        if (isPlayer) {
          this.playerView.hurt(sim.time);
          if (e.statusId === null) this.cameras.main.shake(90, 0.003);
        } else {
          this.creatureViews.get(e.targetId)?.hurt(sim.time);
        }
        const color = isPlayer ? '#ff6a5a' : e.crit ? '#ffd84a' : e.statusId ? '#c6f08a' : '#ffffff';
        this.floatAt(e.targetId, `${e.amount}${e.crit ? '!' : ''}`, color, e.crit);
        break;
      }
      case 'evade':
        this.floatAt(e.targetId, 'Esquiva', '#a8c8ff');
        break;
      case 'defeated': {
        const view = this.creatureViews.get(e.id);
        view?.defeat();
        this.creatureViews.delete(e.id);
        if (e.xp > 0) this.effects.floatText(e.position, `+${e.xp} XP`, '#9fe870', true);
        break;
      }
      case 'despawned':
        this.creatureViews.get(e.id)?.despawn();
        this.creatureViews.delete(e.id);
        break;
      case 'drop-spawned':
        this.dropViews.set(e.drop.id, new DropView(this, e.drop, this.content.items, this.session.map.iso));
        break;
      case 'drop-collected':
      case 'drop-expired':
        this.dropViews.get(e.id)?.remove(e.type === 'drop-collected');
        this.dropViews.delete(e.id);
        break;
      case 'level-up':
        this.effects.floatText(this.session.sim.player.position, `¡Nivel ${e.level}!`, '#ffd84a', true);
        this.cameras.main.flash(250, 255, 230, 140);
        break;
      default:
        break;
    }
  }

  private floatAt(id: string, text: string, color: string, big = false): void {
    const sim = this.session.sim;
    const pos = id === PLAYER_ID ? sim.player.position : sim.creatures.get(id)?.combatant.position;
    if (pos) this.effects.floatText(pos, text, color, big);
  }
}

/** Gancho de solo lectura para pruebas E2E y depuración manual desde la consola. */
function exposeDebug(session: GameSession): void {
  const sim = session.sim;
  window.__5RAZAS__ = {
    player: () => ({
      ...sim.player.position,
      facing: session.player.facing,
      moving: session.player.moving,
      hp: sim.player.hp,
      energy: sim.player.energy,
      alive: sim.player.alive,
    }),
    exploredCells: () => session.exploration.exploredCount,
    creatures: () =>
      [...sim.creatures.values()].map((c) => ({ id: c.id, x: c.combatant.position.x, y: c.combatant.position.y, hp: c.combatant.hp })),
    cooldowns: () =>
      Object.fromEntries(ACTION_SLOTS.map((s) => [s, sim.player.cooldownRemaining(sim.abilityFor(s).id, sim.time)])),
    xp: () => sim.xp,
    level: () => sim.character.level,
    inventory: () => sim.character.inventory.contents.flatMap((s) => (s ? [{ ...s }] : [])),
    equipment: () => sim.character.equipment.toJSON(),
    paused: () => session.paused,
    hour: () => sim.hour,
    plants: () => [...sim.plants.all()].map((n) => ({ id: n.id, plantId: n.plantId, x: n.position.x, y: n.position.y, ready: sim.plants.isReady(n, sim.time, sim.hour) })),
    drops: () => [...sim.drops.all()].map((d) => ({ itemId: d.itemId, x: d.position.x, y: d.position.y })),
    mapId: session.map.id,
  };
}
