import {
  combinedProperties,
  DiscoveryBook,
  totalUnits,
  type IngredientStack,
  type RecipeBook,
} from '../alchemy/alchemy.ts';
import type { ElementCatalog } from '../alchemy/elements.ts';
import { selectDialogue, type NarrativeCatalog } from '../narrative/dialogue.ts';
import type { SavePayload } from '../persistence/saveGame.ts';
import { QuestLog, type QuestCatalog, type QuestSignal, type QuestUpdate } from '../quests/quests.ts';
import { EQUIP_SLOTS } from '../items/itemCatalog.ts';
import { PlayerCharacter, type ItemFailure, type ItemResult } from '../character/playerCharacter.ts';
import type { AbilityCatalog, AbilityDefinition } from '../combat/abilities.ts';
import { Combatant } from '../combat/combatant.ts';
import { CombatWorld, type CombatEvent, type UseFailure } from '../combat/combatWorld.ts';
import type { StatusCatalog } from '../combat/statusEffects.ts';
import { PlantField, type AlchemyElement, type HarvestFailure, type PlantCatalog, type PlantNode } from '../ecosystem/plants.ts';
import type { CharacterConfig } from '../data/characterConfig.ts';
import type { CreatureCatalog } from '../creatures/creatureCatalog.ts';
import { cellToScreen, screenDirToCellDir } from '../math/iso.ts';
import { createRng, type Rng } from '../math/random.ts';
import { length, type Vec2 } from '../math/vector.ts';
import { MAX_DT_SECONDS, stepMotion, type MotionState } from '../movement/characterMotion.ts';
import { directionFromScreenVector } from '../movement/direction.ts';
import type { EquipmentSetCatalog } from '../items/equipmentSets.ts';
import type { EquipSlot, ItemCatalog, UseEffect } from '../items/itemCatalog.ts';
import { rollLoot, type LootTableCatalog } from '../items/lootTables.ts';
import { DropField, type WorldDrop } from '../items/worldDrops.ts';
import type { ActionSlot, ProfessionDefinition } from '../professions/profession.ts';
import { creatureXp, type ProgressionConfig } from '../progression/progression.ts';
import { DynamicObstacles } from '../world/dynamicObstacles.ts';
import { hourAt, type ClockConfig } from '../world/worldClock.ts';
import type { WorldMap } from '../world/worldMap.ts';
import { CreaturePopulation, type CreatureInstance, type PopulationEvent } from './creaturePopulation.ts';

export { ACTIVE_RADIUS, type CreatureInstance } from './creaturePopulation.ts';

export interface SimulationContent {
  readonly map: WorldMap;
  readonly character: CharacterConfig;
  readonly profession: ProfessionDefinition;
  readonly abilities: AbilityCatalog;
  readonly statuses: StatusCatalog;
  readonly creatures: CreatureCatalog;
  readonly items: ItemCatalog;
  readonly sets: EquipmentSetCatalog;
  readonly lootTables: LootTableCatalog;
  readonly progression: ProgressionConfig;
  readonly plants: PlantCatalog;
  readonly clock: ClockConfig;
  readonly elements: ElementCatalog;
  readonly recipes: RecipeBook;
  readonly quests: QuestCatalog;
  readonly narrative: NarrativeCatalog;
}

/** Objetivo de la tecla de interacción: un PNJ (conversar) o una planta (recolectar). */
export type InteractionTarget =
  | { readonly kind: 'npc'; readonly npcId: string; readonly name: string }
  | { readonly kind: 'plant'; readonly node: PlantNode; readonly ready: boolean };

export type AlchemyFailure = 'too-few' | 'too-many' | 'missing-ingredients' | 'invalid-ingredient' | 'dead';
export type AlchemyResult =
  | {
      readonly ok: true;
      /** null si la combinación no corresponde a ninguna receta (resultado menor). */
      readonly recipeId: string | null;
      readonly itemId: string;
      readonly quantity: number;
      readonly firstDiscovery: boolean;
      /** Propiedades combinadas de los ingredientes, como pista para experimentar. */
      readonly properties: readonly { readonly element: AlchemyElement; readonly potency: number }[];
    }
  | { readonly ok: false; readonly reason: AlchemyFailure };

/** Órdenes del jugador para un frame, ya traducidas desde el dispositivo de entrada. */
export interface PlayerCommand {
  /** Intención de movimiento en pantalla (WASD), longitud 0 o 1. */
  readonly move: Vec2;
  /** Dirección de apuntado en celdas (p. ej. hacia el ratón), o null para usar la última. */
  readonly aim: Vec2 | null;
  readonly action: ActionSlot | null;
  /**
   * true si la acción se pulsó en este fotograma (tecla o clic nuevo); false si solo se mantiene
   * (ataque básico con el botón presionado). Solo las pulsaciones nuevas usan el búfer de entrada.
   */
  readonly pressed: boolean;
  /** Ranura rápida de consumible activada en este fotograma (0 = Q, 1 = F), o null. */
  readonly quickSlot: number | null;
  /** Tecla de interacción (E) pulsada en este fotograma. */
  readonly interact: boolean;
}

export type SimEvent =
  | CombatEvent
  | PopulationEvent
  | { readonly type: 'defeated'; readonly id: string; readonly creatureId: string; readonly xp: number; readonly lootTable: string; readonly position: Vec2 }
  | { readonly type: 'player-died' }
  | { readonly type: 'player-respawned' }
  | { readonly type: 'action-failed'; readonly slot: ActionSlot; readonly reason: UseFailure }
  | { readonly type: 'xp-gained'; readonly amount: number; readonly total: number }
  | { readonly type: 'level-up'; readonly level: number; readonly stage: string; readonly unlockedAbilities: readonly string[] }
  | { readonly type: 'drop-spawned'; readonly drop: WorldDrop }
  | { readonly type: 'drop-collected'; readonly id: string; readonly itemId: string; readonly quantity: number }
  | { readonly type: 'drop-expired'; readonly id: string }
  | { readonly type: 'inventory-full'; readonly itemId: string }
  | { readonly type: 'item-used'; readonly itemId: string }
  | { readonly type: 'item-failed'; readonly itemId: string | null; readonly reason: ItemFailure }
  | { readonly type: 'equipment-changed' }
  | { readonly type: 'harvested'; readonly nodeId: string; readonly plantId: string; readonly itemId: string; readonly quantity: number }
  | { readonly type: 'interact-failed'; readonly reason: HarvestFailure | 'nothing' }
  | { readonly type: 'alchemy-result'; readonly result: AlchemyResult & { readonly ok: true } }
  | { readonly type: 'infusion'; readonly elementId: string; readonly until: number }
  | QuestUpdate
  | { readonly type: 'quest-accepted'; readonly questId: string }
  | { readonly type: 'quest-turned-in'; readonly questId: string }
  | { readonly type: 'dialogue'; readonly npcId: string; readonly dialogueId: string }
  | { readonly type: 'boss-defeated'; readonly creatureId: string };

export const PLAYER_ID = 'player';
export const PLAYER_RESPAWN_SECONDS = 3;
/** Ventana durante la que se recuerda una acción pulsada mientras el personaje está ocupado. */
export const INPUT_BUFFER_SECONDS = 0.3;
/** Distancia máxima para interactuar con objetos del mundo (recolección). */
export const INTERACT_RADIUS = 1.4;
/** Distancia máxima para conversar con un PNJ. */
export const TALK_RADIUS = 1.8;
/** Segundos que el personaje queda ocupado al recolectar. */
const HARVEST_BUSY_SECONDS = 0.4;

/**
 * Simulación completa del sector: jugador, criaturas, IA, combate y apariciones.
 * No depende de Phaser; la escena solo traduce entrada y dibuja los eventos.
 */
export class WorldSimulation {
  readonly combat: CombatWorld;
  readonly player: Combatant;
  playerMotion: MotionState;
  readonly population: CreaturePopulation;
  /** Colisiones del mapa más obstáculos temporales. */
  readonly world: DynamicObstacles;
  readonly character: PlayerCharacter;
  readonly drops = new DropField();
  readonly plants: PlantField;
  readonly discoveries = new DiscoveryBook();
  readonly quests: QuestLog;
  private readonly content: SimulationContent;
  private readonly rng: Rng;
  private playerRespawnAt: number | null = null;
  private buffered: { slot: ActionSlot; until: number } | null = null;
  private events: SimEvent[] = [];
  /** Evita repetir el aviso de inventario lleno en cada fotograma. */
  private inventoryFullNoticeAt = -Infinity;

  constructor(content: SimulationContent, seed = 1) {
    this.content = content;
    this.rng = createRng(seed);
    this.world = new DynamicObstacles(content.map);
    this.combat = new CombatWorld(this.world, content.statuses, this.rng, content.elements);
    const { profession, character, map } = content;
    this.character = new PlayerCharacter({
      profession,
      abilities: content.abilities,
      items: content.items,
      sets: content.sets,
      progression: content.progression,
      inventoryCapacity: character.inventoryCapacity,
    });
    for (const it of character.startingItems) this.character.inventory.add(it.itemId, it.quantity);
    for (const id of character.startingEquipment) this.character.equipment.put(id);
    character.startingQuickSlots.forEach((id, i) => this.character.assignQuickSlot(i, id));
    this.player = new Combatant({
      id: PLAYER_ID,
      team: 'player',
      position: map.spawn,
      stats: this.character.computeStats(),
      level: this.character.level,
      hurtboxRadius: profession.hurtboxRadius,
      colliderHalfSize: character.colliderHalfSize,
      invulnerabilityOnHit: profession.invulnerabilityOnHit,
      poise: Infinity, // El jugador controla sus propias acciones (no se interrumpe).
      energyRegen: profession.energyRegen,
    });
    this.combat.add(this.player);
    this.playerMotion = { position: map.spawn, facing: 's', moving: false };
    this.plants = PlantField.place(map, map.gatherZones, content.plants, this.rng);
    this.population = new CreaturePopulation({
      map,
      world: this.world,
      creatures: content.creatures,
      abilities: content.abilities,
      combat: this.combat,
      rng: this.rng,
      emit: (e) => this.events.push(e),
    });
    this.quests = new QuestLog(content.quests);
    this.population.spawnInitial(this.hour, this.player.position);
  }

  /** Criaturas presentes en el sector. */
  get creatures(): ReadonlyMap<string, CreatureInstance> {
    return this.population.creatures;
  }

  get time(): number {
    return this.combat.time;
  }

  /** Hora del día (0–24). */
  get hour(): number {
    return hourAt(this.content.clock, this.time);
  }

  /** PNJ más cercano al alcance de conversación. */
  private nearestNpc(): { readonly npcId: string } | null {
    let best: { npcId: string } | null = null;
    let bestDist = TALK_RADIUS;
    for (const n of this.content.map.npcs) {
      const d = Math.hypot(n.position.x - this.player.position.x, n.position.y - this.player.position.y);
      if (d <= bestDist) {
        best = n;
        bestDist = d;
      }
    }
    return best;
  }

  /** A qué apunta la interacción (E): conversar tiene prioridad sobre recolectar. */
  interactionTarget(): InteractionTarget | null {
    if (!this.player.alive) return null;
    const npc = this.nearestNpc();
    if (npc) return { kind: 'npc', npcId: npc.npcId, name: this.content.narrative.npcs.get(npc.npcId)?.name ?? npc.npcId };
    const node = this.plants.nearest(this.player.position, INTERACT_RADIUS, this.time, this.hour);
    return node ? { kind: 'plant', node, ready: this.plants.isReady(node, this.time, this.hour) } : null;
  }

  // --- Misiones y diálogos ---

  private questSignal(signal: QuestSignal): void {
    for (const u of this.quests.signal(signal)) this.events.push(u);
  }

  /**
   * Ejecuta la opción elegida en un diálogo y devuelve el siguiente diálogo, o null para cerrar.
   * Las acciones (aceptar o entregar misiones) se validan aquí, no en la interfaz.
   */
  chooseDialogueOption(dialogueId: string, optionIndex: number): string | null {
    const node = this.content.narrative.dialogues.get(dialogueId);
    const option = node?.options[optionIndex];
    if (!option) return null;
    const a = option.action;
    switch (a.type) {
      case 'close':
        return null;
      case 'goto':
        return a.next;
      case 'accept':
        if (!this.quests.accept(a.questId)) return null;
        this.events.push({ type: 'quest-accepted', questId: a.questId });
        for (const u of this.quests.refreshCollect((id) => this.character.inventory.count(id))) this.events.push(u);
        return a.next;
      case 'turn-in': {
        const rewards = this.quests.turnIn(a.questId);
        if (!rewards) return null;
        for (const it of rewards.items) this.giveItem(it.itemId, it.quantity);
        this.events.push({ type: 'quest-turned-in', questId: a.questId });
        this.addXp(rewards.xp);
        return a.next;
      }
    }
  }

  /** Entrega un objeto al jugador; lo que no cabe cae al suelo junto a él. */
  private giveItem(itemId: string, quantity: number): void {
    const left = this.character.inventory.add(itemId, quantity);
    this.events.push({ type: 'drop-collected', id: `reward-${itemId}`, itemId, quantity: quantity - left });
    if (left > 0) {
      const drop = this.drops.spawn(itemId, left, this.player.position, this.time, this.world, this.rng);
      this.events.push({ type: 'drop-spawned', drop });
      this.events.push({ type: 'inventory-full', itemId });
    }
  }

  /** Experiencia total del jugador. */
  get xp(): number {
    return this.character.xp;
  }

  /** Eventos generados fuera de `update` (p. ej. acciones de la interfaz con el juego en pausa). */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Recalcula los atributos del combatiente tras subir de nivel o cambiar el equipo. */
  private syncPlayerStats(): void {
    const p = this.player;
    p.stats = this.character.computeStats();
    p.level = this.character.level;
    p.hp = Math.min(p.hp, p.stats.life);
    p.energy = Math.min(p.energy, p.stats.energy);
  }

  /** Otorga experiencia (combate, y en fases futuras misiones y exploración). */
  addXp(amount: number): void {
    const ups = this.character.addXp(amount);
    if (amount > 0) this.events.push({ type: 'xp-gained', amount: Math.round(amount), total: this.character.xp });
    if (ups.length === 0) return;
    this.syncPlayerStats();
    if (this.content.progression.fullHealOnLevelUp && this.player.alive) {
      this.player.hp = this.player.stats.life;
      this.player.energy = this.player.stats.energy;
    }
    for (const up of ups) {
      this.events.push({ type: 'level-up', level: up.level, stage: this.character.stage.name, unlockedAbilities: up.unlockedAbilities });
    }
  }

  private applyItemEffect(e: UseEffect): void {
    if (e.kind === 'applyStatus') {
      this.combat.applyStatusTo(PLAYER_ID, e.statusId, PLAYER_ID);
    } else if (e.kind === 'infusion') {
      // Solo una infusión activa: la nueva reemplaza a la anterior.
      this.player.infusion = { elementId: e.elementId, until: this.time + e.duration };
      this.events.push({ type: 'infusion', elementId: e.elementId, until: this.player.infusion.until });
    }
  }

  /**
   * Combina ingredientes del inventario (GAME_DESIGN §10.5). Una combinación conocida produce su
   * resultado y, la primera vez, se registra en el libro de descubrimientos. Una combinación inválida
   * consume los ingredientes y produce el resultado menor configurado.
   */
  experiment(ingredients: readonly IngredientStack[]): AlchemyResult {
    if (!this.player.alive) return { ok: false, reason: 'dead' };
    const units = totalUnits(ingredients);
    if (units < 2) return { ok: false, reason: 'too-few' };
    if (units > this.content.recipes.config.maxUnits) return { ok: false, reason: 'too-many' };
    const inv = this.character.inventory;
    const needed = new Map<string, number>();
    for (const i of ingredients) needed.set(i.itemId, (needed.get(i.itemId) ?? 0) + i.quantity);
    for (const [itemId, qty] of needed) {
      const category = this.content.items.all.get(itemId)?.category;
      if (category !== 'ingredient' && category !== 'material') return { ok: false, reason: 'invalid-ingredient' };
      if (inv.count(itemId) < qty) return { ok: false, reason: 'missing-ingredients' };
    }
    for (const [itemId, qty] of needed) inv.remove(itemId, qty);

    const recipe = this.content.recipes.find(ingredients);
    const produced = recipe?.result ?? this.content.recipes.config.failedResult;
    const left = inv.add(produced.itemId, produced.quantity);
    if (left > 0) {
      const drop = this.drops.spawn(produced.itemId, left, this.player.position, this.time, this.content.map, this.rng);
      this.events.push({ type: 'drop-spawned', drop });
      this.events.push({ type: 'inventory-full', itemId: produced.itemId });
    }
    const firstDiscovery = recipe ? this.discoveries.record(recipe.id) : false;
    const result = {
      ok: true as const,
      recipeId: recipe?.id ?? null,
      itemId: produced.itemId,
      quantity: produced.quantity,
      firstDiscovery,
      properties: combinedProperties(ingredients, this.content.plants),
    };
    this.events.push({ type: 'alchemy-result', result });
    if (recipe && firstDiscovery) {
      this.addXp(recipe.discoveryXp);
      this.questSignal({ kind: 'discover', target: recipe.id });
    }
    return result;
  }

  // --- Acciones de inventario (llamadas desde la interfaz) ---

  equip(inventoryIndex: number): ItemResult {
    const itemId = this.character.inventory.at(inventoryIndex)?.itemId ?? null;
    const r = this.character.equipFromInventory(inventoryIndex);
    if (!r.ok) {
      this.events.push({ type: 'item-failed', itemId, reason: r.reason });
      return r;
    }
    this.syncPlayerStats();
    this.events.push({ type: 'equipment-changed' });
    return r;
  }

  unequip(slot: EquipSlot): ItemResult {
    const r = this.character.unequip(slot);
    if (!r.ok) {
      this.events.push({ type: 'item-failed', itemId: this.character.equipment.get(slot), reason: r.reason });
      return r;
    }
    this.syncPlayerStats();
    this.events.push({ type: 'equipment-changed' });
    return r;
  }

  useItem(itemId: string): ItemResult {
    const r = this.character.useItem(itemId, this.player, this.time, (e) => { this.applyItemEffect(e); });
    this.events.push(r.ok ? { type: 'item-used', itemId } : { type: 'item-failed', itemId, reason: r.reason });
    return r;
  }

  abilityFor(slot: ActionSlot): AbilityDefinition {
    return this.content.abilities.get(this.content.profession.abilities[slot]);
  }

  update(dtSeconds: number, cmd: PlayerCommand): SimEvent[] {
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_DT_SECONDS);
    this.updatePlayer(dt, cmd);
    this.population.update(dt, this.player.alive ? this.player : null, this.player.position, this.time, this.rng);
    this.combat.update(dt);
    this.playerMotion = { ...this.playerMotion, position: this.player.position };
    this.population.syncMotion();
    for (const e of this.combat.drainEvents()) this.handleCombatEvent(e);
    this.updateDrops();
    this.processPlayerRespawn();
    this.population.maintain(this.time, this.hour, this.player.position);
    for (const u of this.quests.refreshCollect((id) => this.character.inventory.count(id))) this.events.push(u);
    return this.drainEvents();
  }

  private updateDrops(): void {
    if (this.player.alive) {
      const { collected, blocked } = this.drops.collect(this.player.position, this.character.inventory);
      for (const d of collected) this.events.push({ type: 'drop-collected', id: d.id, itemId: d.itemId, quantity: d.quantity });
      const first = blocked[0];
      if (first && this.time - this.inventoryFullNoticeAt > 3) {
        this.inventoryFullNoticeAt = this.time;
        this.events.push({ type: 'inventory-full', itemId: first.itemId });
      }
    }
    for (const d of this.drops.expire(this.time)) this.events.push({ type: 'drop-expired', id: d.id });
  }

  private updatePlayer(dt: number, cmd: PlayerCommand): void {
    const p = this.player;
    if (!p.alive) {
      this.playerMotion = { ...this.playerMotion, moving: false };
      return;
    }
    if (cmd.interact && p.canAct(this.time)) this.interact();
    if (cmd.quickSlot !== null) {
      const itemId = this.character.quickSlots[cmd.quickSlot] ?? null;
      if (itemId) this.useItem(itemId);
      else this.events.push({ type: 'item-failed', itemId: null, reason: 'missing' });
    }
    // Una pulsación nueva reemplaza a la almacenada; mantener el ataque básico no se almacena.
    if (cmd.action && cmd.pressed) this.buffered = { slot: cmd.action, until: this.time + INPUT_BUFFER_SECONDS };
    if (this.buffered && this.time > this.buffered.until) this.buffered = null;
    const slot = this.buffered?.slot ?? cmd.action;
    if (slot) {
      const ability = this.abilityFor(slot);
      const moveCells = screenDirToCellDir(cmd.move);
      // La evasión sigue la dirección de movimiento; el resto apunta al cursor.
      const aim = slot === 'dodge' && length(moveCells) > 0 ? moveCells : (cmd.aim ?? p.aim);
      const result = this.combat.useAbility(p.id, ability, aim);
      if (result.ok) {
        this.buffered = null;
        const facing = directionFromScreenVector(cellToScreen(p.aim));
        if (facing) this.playerMotion = { ...this.playerMotion, facing };
      } else if (result.reason !== 'busy' && slot !== 'basic') {
        // Solo "ocupado" justifica esperar; el resto de fallos se informa una vez.
        this.buffered = null;
        this.events.push({ type: 'action-failed', slot, reason: result.reason });
      }
    }
    if (p.canAct(this.time)) {
      // La posición autoritativa es la del combatiente (puede cambiar por dash, retroceso o carga).
      const base = { ...this.playerMotion, position: p.position };
      this.playerMotion = stepMotion(base, cmd.move, dt, this.world, {
        moveSpeed: p.stats.speed * p.speedMultiplier,
        colliderHalfSize: p.colliderHalfSize,
      });
      p.position = this.playerMotion.position;
    } else {
      this.playerMotion = { ...this.playerMotion, moving: p.dash !== null };
    }
  }

  /** Recolecta la planta más cercana; el resultado va al inventario o, si no cabe, al suelo. */
  private interact(): void {
    const npc = this.nearestNpc();
    const npcDef = npc ? this.content.narrative.npcs.get(npc.npcId) : undefined;
    if (npcDef) {
      this.events.push({ type: 'dialogue', npcId: npcDef.id, dialogueId: selectDialogue(npcDef, this.quests) });
      return;
    }
    const node = this.plants.nearest(this.player.position, INTERACT_RADIUS, this.time, this.hour);
    if (!node) {
      this.events.push({ type: 'interact-failed', reason: 'nothing' });
      return;
    }
    const r = this.plants.harvest(node.id, this.time, this.hour, this.rng);
    if (!r.ok) {
      this.events.push({ type: 'interact-failed', reason: r.reason });
      return;
    }
    this.player.busyUntil = this.time + HARVEST_BUSY_SECONDS;
    const left = this.character.inventory.add(r.itemId, r.quantity);
    if (left > 0) {
      const drop = this.drops.spawn(r.itemId, left, this.player.position, this.time, this.content.map, this.rng);
      this.events.push({ type: 'drop-spawned', drop });
      this.events.push({ type: 'inventory-full', itemId: r.itemId });
    }
    this.events.push({ type: 'harvested', nodeId: node.id, plantId: node.plantId, itemId: r.itemId, quantity: r.quantity });
    this.questSignal({ kind: 'gather', target: node.plantId, amount: r.quantity });
    this.addXp(r.xp);
  }

  private handleCombatEvent(e: CombatEvent): void {
    this.events.push(e);
    if (e.type === 'damage') this.creatures.get(e.targetId)?.brain.notifyDamaged(this.time);
    if (e.type !== 'death') return;
    if (e.targetId === PLAYER_ID) {
      this.playerRespawnAt = this.time + PLAYER_RESPAWN_SECONDS;
      this.events.push({ type: 'player-died' });
      return;
    }
    const c = this.population.removeDefeated(e.targetId, this.time);
    if (!c) return;
    const byPlayer = e.killerId === PLAYER_ID;
    const xp = byPlayer ? creatureXp(this.content.progression, c.def.xpReward, c.level) : 0;
    this.events.push({
      type: 'defeated',
      id: c.id,
      creatureId: c.def.id,
      xp,
      lootTable: c.def.lootTable,
      position: c.combatant.position,
    });
    if (byPlayer) {
      this.questSignal({ kind: 'defeat', target: c.def.id });
      if (c.def.category === 'boss') this.events.push({ type: 'boss-defeated', creatureId: c.def.id });
      this.addXp(xp);
      for (const loot of rollLoot(this.content.lootTables.get(c.def.lootTable), this.rng)) {
        const drop = this.drops.spawn(loot.itemId, loot.quantity, c.combatant.position, this.time, this.content.map, this.rng);
        this.events.push({ type: 'drop-spawned', drop });
      }
    }
  }

  /** Estado persistente de la simulación (sin exploración ni ajustes, que aporta la sesión). */
  snapshot(): Omit<SavePayload, 'exploration' | 'settings'> {
    const { character } = this.content;
    return {
      character: { id: character.id, name: character.name, professionId: character.professionId, people: null },
      xp: this.character.xp,
      player: { x: this.player.position.x, y: this.player.position.y, hp: this.player.hp, energy: this.player.energy },
      inventory: this.character.inventory.toJSON(),
      equipment: this.character.equipment.toJSON(),
      quickSlots: [...this.character.quickSlots],
      discoveries: this.discoveries.toJSON(),
      quests: this.quests.toJSON(),
      worldTime: this.time,
      mapId: this.content.map.id,
      bossesDefeated: [...this.population.defeatedBosses],
    };
  }

  /**
   * Restaura una partida guardada. Las referencias desconocidas (p. ej. un objeto eliminado del
   * contenido) se descartan y se informan como advertencias, sin impedir la carga.
   */
  restore(p: SavePayload): string[] {
    const warnings: string[] = [];
    const { items, recipes } = this.content;
    this.combat.time = p.worldTime;
    this.character.restoreXp(p.xp);
    const unknown = p.inventory.filter((st) => st !== null && !items.all.has(st.itemId));
    if (unknown.length > 0) warnings.push(`${unknown.length} objetos desconocidos descartados`);
    this.character.inventory.restore(p.inventory);
    for (const slot of EQUIP_SLOTS) this.character.equipment.take(slot);
    for (const [slot, id] of Object.entries(p.equipment)) {
      if (items.all.get(id)?.equip?.slot === slot) this.character.equipment.put(id);
      else warnings.push(`equipo "${id}" descartado`);
    }
    p.quickSlots.forEach((id, i) => this.character.assignQuickSlot(i, id !== null && items.all.has(id) ? id : null));
    for (const id of p.discoveries) if (recipes.recipes.has(id)) this.discoveries.record(id);
    this.quests.restore(p.quests);
    for (const id of p.bossesDefeated) this.population.markBossDefeated(id);
    this.syncPlayerStats();
    const pos = { x: p.player.x, y: p.player.y };
    const valid = !this.world.isBlocked(Math.floor(pos.x), Math.floor(pos.y));
    if (!valid) warnings.push('posición inválida: se usa el punto de inicio');
    this.player.reset(valid ? pos : this.content.map.spawn);
    this.player.hp = Math.max(1, Math.min(p.player.hp, this.player.stats.life));
    this.player.energy = Math.min(p.player.energy, this.player.stats.energy);
    this.playerMotion = { position: this.player.position, facing: 's', moving: false };
    return warnings;
  }

  private processPlayerRespawn(): void {
    if (this.playerRespawnAt !== null && this.time >= this.playerRespawnAt) {
      this.playerRespawnAt = null;
      this.player.reset(this.content.map.spawn);
      this.playerMotion = { position: this.player.position, facing: 's', moving: false };
      this.events.push({ type: 'player-respawned' });
    }
  }
}

export { validateContentReferences } from './contentValidation.ts';
