import Phaser from 'phaser';
import { predictArea } from '../../core/combat/combatWorld.ts';
import { mapScreenBounds, tileCenterToScreen } from '../../core/math/iso.ts';
import type { SaveData } from '../../core/persistence/saveGame.ts';
import { darknessAt } from '../../core/world/worldClock.ts';
import { ACTION_SLOTS } from '../../core/professions/profession.ts';
import { PLAYER_ID, type SimEvent } from '../../core/simulation/worldSimulation.ts';
import type { GameContent } from '../content.ts';
import { CreatureView } from '../entities/creatureView.ts';
import { DropView } from '../entities/dropView.ts';
import { NpcView } from '../entities/npcView.ts';
import { PlantView } from '../entities/plantView.ts';
import { PlayerView } from '../entities/playerView.ts';
import { PlayerInput } from '../input/playerInput.ts';
import { REGISTRY_SETTINGS, type UserSettings } from '../input/settings.ts';
import { CombatEffects } from '../rendering/combatEffects.ts';
import { OVERLAY_DEPTH, sortedDepth } from '../rendering/depth.ts';
import { OBSTACLE_TEXTURE } from '../rendering/placeholderTextures.ts';
import { IndexedDbSaveStorage, SAVE_SLOT } from '../persistence/indexedDbStorage.ts';
import { WorldRenderer } from '../rendering/worldRenderer.ts';
import { GameSession } from '../session.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

/** Pantallas superpuestas: solo una abierta a la vez; todas pausan la simulación. */
const OVERLAYS = [SceneKeys.Inventory, SceneKeys.Alchemy, SceneKeys.Journal, SceneKeys.Map, SceneKeys.Pause, SceneKeys.Dialogue, SceneKeys.Options] as const;
type OverlayKey = (typeof OVERLAYS)[number];
interface Closable {
  close(): void;
}

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
  private readonly obstacleViews = new Map<string, Phaser.GameObjects.Image>();
  private npcViews: NpcView[] = [];
  private night!: Phaser.GameObjects.Rectangle;
  private content!: GameContent;
  private save: SaveData | null = null;
  /** Métricas de rendimiento: media móvil del tiempo de simulación por fotograma (ms). */
  readonly metrics = { simMs: 0, worstSimMs: 0 };

  constructor() {
    super(SceneKeys.Game);
  }

  /** `save`: partida a continuar (null = partida nueva). */
  init(data: { save?: SaveData | null }): void {
    this.save = data.save ?? null;
  }

  create(): void {
    const content = this.registry.get(REGISTRY_CONTENT) as GameContent;
    this.content = content;
    const map = content.map;
    this.session = new GameSession(content, { save: this.save, storage: new IndexedDbSaveStorage(), slot: SAVE_SLOT });
    if (this.session.loadWarnings.length > 0) console.warn('Advertencias al cargar:', this.session.loadWarnings);
    this.creatureViews.clear();
    this.dropViews.clear();
    this.plantViews.clear();
    this.obstacleViews.clear();
    this.npcViews = map.npcs.flatMap((n) => {
      const def = content.narrative.npcs.get(n.npcId);
      return def ? [new NpcView(this, n, def, map.iso)] : [];
    });

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
    this.playerInput = new PlayerInput(this, this.settings().bindings);
    // Los cambios de teclas desde Opciones se aplican al momento.
    const onSettings = () => {
      this.playerInput.destroy();
      this.playerInput = new PlayerInput(this, this.settings().bindings);
    };
    this.registry.events.on(`changedata-${REGISTRY_SETTINGS}`, onSettings);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.registry.events.off(`changedata-${REGISTRY_SETTINGS}`, onSettings));

    const camera = this.cameras.main;
    camera.setBackgroundColor('#0d0f14');
    const b = mapScreenBounds(map.width, map.height, map.iso);
    camera.setBounds(b.x, b.y - 64, b.width, b.height + 96);
    camera.startFollow(this.playerView.sprite, true, 0.15, 0.15);
    camera.setRoundPixels(true);

    this.scene.launch(SceneKeys.Hud, { session: this.session });
    exposeDebug(this.session, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SceneKeys.Hud);
      for (const key of OVERLAYS) this.scene.stop(key);
    });
  }

  override update(_time: number, deltaMs: number): void {
    const sim = this.session.sim;
    // La lectura se hace siempre, para consumir pulsaciones y clics hechos sobre el inventario.
    const cmd = this.playerInput.read(sim.player.position);
    if (this.playerInput.perfPressed()) this.registry.set(REGISTRY_SETTINGS, { ...this.settings(), showPerf: !this.settings().showPerf });
    const overlay = this.playerInput.overlayPressed();
    // Mientras se reasignan teclas o se conversa, solo Esc actúa (las demás teclas son de esa pantalla).
    const modal = this.scene.isActive(SceneKeys.Options) || this.scene.isActive(SceneKeys.Dialogue);
    if (overlay === 'menu') this.escape();
    else if (modal) {
      this.syncViews();
      return;
    }
    else if (overlay) this.toggleOverlay(({ inventory: SceneKeys.Inventory, alchemy: SceneKeys.Alchemy, journal: SceneKeys.Journal, map: SceneKeys.Map } as const)[overlay]);
    const t0 = performance.now();
    const events = this.session.paused ? this.session.flush() : this.session.update(deltaMs / 1000, cmd);
    const simMs = performance.now() - t0;
    this.metrics.simMs = this.metrics.simMs * 0.95 + simMs * 0.05;
    this.metrics.worstSimMs = Math.max(this.metrics.worstSimMs * 0.999, simMs);
    for (const e of events) this.handleEvent(e);
    this.syncViews();
  }

  private settings(): UserSettings {
    return this.registry.get(REGISTRY_SETTINGS) as UserSettings;
  }

  /** Actualiza la representación a partir del estado de la simulación. */
  private syncViews(): void {
    const sim = this.session.sim;

    this.playerView.sync(this.session.player, sim.player, sim.time);
    this.world.updateOcclusion(sim.player.position);
    this.world.cull(this.cameras.main.worldView);
    const hour = sim.hour;
    for (const [id, view] of this.plantViews) {
      const node = sim.plants.get(id);
      if (node) view.sync(sim.plants.isReady(node, sim.time, hour));
    }
    // De día la capa no se dibuja (aun transparente ocuparía toda la pantalla).
    const darkness = darknessAt(hour);
    this.night.setVisible(darkness > 0);
    if (darkness > 0) this.night.setSize(this.scale.width, this.scale.height).setFillStyle(0x0a1030, darkness * 0.5);
    for (const [id, view] of this.creatureViews) {
      const c = sim.creatures.get(id);
      if (c) view.sync(c, sim.time);
    }
    for (const npc of this.npcViews) npc.sync(sim.quests);
  }

  /** Elementos del mapa dibujados frente al total (culling). */
  worldStats(): { visible: number; total: number } {
    return this.world.stats();
  }

  private activeOverlay(): OverlayKey | null {
    return OVERLAYS.find((k) => this.scene.isActive(k)) ?? null;
  }

  private closeOverlay(key: OverlayKey): void {
    (this.scene.get(key) as unknown as Closable).close();
  }

  /** Esc: cierra la pantalla abierta o, si no hay ninguna, abre el menú de pausa. */
  private escape(): void {
    const open = this.activeOverlay();
    if (open) this.closeOverlay(open);
    else this.toggleOverlay(SceneKeys.Pause);
  }

  /** Abre o cierra una pantalla superpuesta; solo una a la vez. */
  private toggleOverlay(key: OverlayKey, data: Record<string, unknown> = {}): void {
    const open = this.activeOverlay();
    if (open === key) {
      this.closeOverlay(key);
      return;
    }
    if (!this.session.sim.player.alive && key !== SceneKeys.Pause) return;
    if (open) this.closeOverlay(open);
    this.scene.launch(key, { session: this.session, ...data });
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
        if (e.casterId === PLAYER_ID) {
          const a = e.ability;
          const busy = (a.dash?.duration ?? 0) + a.windup + Math.max(0, a.hits - 1) * a.hitInterval + 0.15;
          this.playerView.act(a.animation, sim.time, busy);
        }
        // Telegrafía de ataques enemigos durante su preparación.
        if (e.casterId !== PLAYER_ID && e.ability.windup > 0) {
          const area = predictArea(e.ability, e.origin, e.aim);
          if (area) this.effects.showArea(area, e.ability.vfx, e.ability.windup, true);
          this.creatureViews.get(e.casterId)?.telegraph(sim.time + e.ability.windup);
        }
        break;
      }
      case 'hit': {
        const color = e.element ? this.content.elements.get(e.element).color : null;
        this.effects.showArea(e.area, e.ability.vfx, 0.18, false, color);
        break;
      }
      case 'heal':
        this.floatAt(e.targetId, `+${e.amount}`, '#7fe07a');
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
        const elementColor = e.element ? this.content.elements.get(e.element).color : null;
        const color = isPlayer ? '#ff6a5a' : e.crit ? '#ffd84a' : (elementColor ?? (e.statusId ? '#c6f08a' : '#ffffff'));
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
      case 'dialogue':
        this.toggleOverlay(SceneKeys.Dialogue, { dialogueId: e.dialogueId });
        break;
      case 'obstacle-spawned': {
        const p = tileCenterToScreen(e.obstacle.x, e.obstacle.y, this.session.map.iso);
        const img = this.add.image(p.x, p.y + 8, OBSTACLE_TEXTURE).setOrigin(0.5, 1).setDepth(sortedDepth(p.y)).setScale(1, 0.2);
        this.tweens.add({ targets: img, scaleY: 1, duration: 250, ease: 'Back.easeOut' });
        this.obstacleViews.set(`${e.obstacle.x},${e.obstacle.y}`, img);
        break;
      }
      case 'obstacle-removed': {
        const key = `${e.obstacle.x},${e.obstacle.y}`;
        const img = this.obstacleViews.get(key);
        this.obstacleViews.delete(key);
        if (img) this.tweens.add({ targets: img, alpha: 0, scaleY: 0.2, duration: 250, onComplete: () => { img.destroy(); } });
        break;
      }
      case 'boss-phase':
        this.cameras.main.shake(400, 0.008);
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
function exposeDebug(session: GameSession, scene: GameScene): void {
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
    discoveries: () => session.sim.discoveries.toJSON(),
    hour: () => sim.hour,
    plants: () => [...sim.plants.all()].map((n) => ({ id: n.id, plantId: n.plantId, x: n.position.x, y: n.position.y, ready: sim.plants.isReady(n, sim.time, sim.hour) })),
    drops: () => [...sim.drops.all()].map((d) => ({ itemId: d.itemId, x: d.position.x, y: d.position.y })),
    mapId: session.map.id,
    quests: () => sim.quests.toJSON(),
    boss: () => {
      const b = [...sim.creatures.values()].find((c) => c.boss !== null);
      return b ? { id: b.id, x: b.combatant.position.x, y: b.combatant.position.y, hp: b.combatant.hp, phase: b.boss?.phase ?? 0 } : null;
    },
    save: () => session.save('manual'),
    perf: () => ({ fps: scene.game.loop.actualFps, simMs: scene.metrics.simMs, worstSimMs: scene.metrics.worstSimMs, ...scene.worldStats() }),
  };
}
