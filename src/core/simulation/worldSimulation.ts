import { CreatureBrain } from '../ai/creatureBrain.ts';
import {
  combinedProperties,
  DiscoveryBook,
  totalUnits,
  type IngredientStack,
  type RecipeBook,
} from '../alchemy/alchemy.ts';
import type { ElementCatalog } from '../alchemy/elements.ts';
import { PlayerCharacter, type ItemFailure, type ItemResult } from '../character/playerCharacter.ts';
import { Navigator } from '../ai/navigator.ts';
import type { AbilityCatalog, AbilityDefinition } from '../combat/abilities.ts';
import { Combatant } from '../combat/combatant.ts';
import { CombatWorld, type CombatEvent, type UseFailure } from '../combat/combatWorld.ts';
import type { StatusCatalog } from '../combat/statusEffects.ts';
import { PlantField, type AlchemyElement, type HarvestFailure, type PlantCatalog, type PlantNode } from '../ecosystem/plants.ts';
import type { CharacterConfig } from '../data/characterConfig.ts';
import type { CreatureCatalog, CreatureDefinition } from '../creatures/creatureCatalog.ts';
import { cellToScreen, screenDirToCellDir } from '../math/iso.ts';
import { createRng, type Rng } from '../math/random.ts';
import { distance, length, type Vec2 } from '../math/vector.ts';
import { MAX_DT_SECONDS, stepMotion, stepMotionCells, type MotionState } from '../movement/characterMotion.ts';
import { directionFromScreenVector } from '../movement/direction.ts';
import type { EquipmentSetCatalog } from '../items/equipmentSets.ts';
import type { EquipSlot, ItemCatalog, UseEffect } from '../items/itemCatalog.ts';
import { rollLoot, type LootTableCatalog } from '../items/lootTables.ts';
import { DropField, type WorldDrop } from '../items/worldDrops.ts';
import type { ActionSlot, ProfessionDefinition } from '../professions/profession.ts';
import { creatureXp, statsAtLevel, type ProgressionConfig } from '../progression/progression.ts';
import { collides } from '../world/collision.ts';
import { hourAt, inHourRange, type ClockConfig } from '../world/worldClock.ts';
import type { SpawnZone, WorldMap } from '../world/worldMap.ts';

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
}

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
  | { readonly type: 'spawned'; readonly id: string; readonly creatureId: string }
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
  | { readonly type: 'despawned'; readonly id: string }
  | { readonly type: 'harvested'; readonly nodeId: string; readonly plantId: string; readonly itemId: string; readonly quantity: number }
  | { readonly type: 'interact-failed'; readonly reason: HarvestFailure | 'nothing' }
  | { readonly type: 'alchemy-result'; readonly result: AlchemyResult & { readonly ok: true } }
  | { readonly type: 'infusion'; readonly elementId: string; readonly until: number };

export interface CreatureInstance {
  readonly id: string;
  readonly def: CreatureDefinition;
  readonly zoneId: string;
  readonly combatant: Combatant;
  readonly brain: CreatureBrain;
  /** Ataque de la criatura; null para fauna que solo huye. */
  readonly ability: AbilityDefinition | null;
  readonly level: number;
  motion: MotionState;
}

export const PLAYER_ID = 'player';
/** Las criaturas más lejanas que esto (celdas) no ejecutan IA (GAME_DESIGN §14). */
export const ACTIVE_RADIUS = 22;
export const PLAYER_RESPAWN_SECONDS = 3;
/** Ventana durante la que se recuerda una acción pulsada mientras el personaje está ocupado. */
export const INPUT_BUFFER_SECONDS = 0.3;
/** Distancia mínima al jugador para hacer aparecer criaturas. */
const SPAWN_SAFE_DISTANCE = 6;
/** Distancia máxima para interactuar con objetos del mundo (recolección). */
export const INTERACT_RADIUS = 1.4;
/** Segundos que el personaje queda ocupado al recolectar. */
const HARVEST_BUSY_SECONDS = 0.4;
/** Cada cuánto se revisa qué criaturas salen de su horario. */
const SCHEDULE_CHECK_SECONDS = 1;

/**
 * Simulación completa del sector: jugador, criaturas, IA, combate y apariciones.
 * No depende de Phaser; la escena solo traduce entrada y dibuja los eventos.
 */
export class WorldSimulation {
  readonly combat: CombatWorld;
  readonly player: Combatant;
  playerMotion: MotionState;
  readonly creatures = new Map<string, CreatureInstance>();
  readonly character: PlayerCharacter;
  readonly drops = new DropField();
  readonly plants: PlantField;
  readonly discoveries = new DiscoveryBook();
  private readonly content: SimulationContent;
  private readonly rng: Rng;
  private readonly respawns: { zone: SpawnZone; at: number }[] = [];
  private playerRespawnAt: number | null = null;
  private buffered: { slot: ActionSlot; until: number } | null = null;
  private serial = 0;
  private events: SimEvent[] = [];
  /** Evita repetir el aviso de inventario lleno en cada fotograma. */
  private inventoryFullNoticeAt = -Infinity;
  private nextScheduleCheck = 0;

  constructor(content: SimulationContent, seed = 1) {
    this.content = content;
    this.rng = createRng(seed);
    this.combat = new CombatWorld(content.map, content.statuses, this.rng, content.elements);
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
    for (const zone of map.spawnZones) {
      for (let i = 0; i < zone.count; i++) {
        // Si la especie no está activa a esta hora, su aparición queda pendiente.
        if (!this.spawnCreature(zone)) this.respawns.push({ zone, at: 0 });
      }
    }
  }

  get time(): number {
    return this.combat.time;
  }

  /** Hora del día (0–24). */
  get hour(): number {
    return hourAt(this.content.clock, this.time);
  }

  /** Planta al alcance del jugador y si puede recolectarse ahora (para el aviso de interacción). */
  interactionTarget(): { node: PlantNode; ready: boolean } | null {
    if (!this.player.alive) return null;
    const node = this.plants.nearest(this.player.position, INTERACT_RADIUS, this.time, this.hour);
    return node ? { node, ready: this.plants.isReady(node, this.time, this.hour) } : null;
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
    if (recipe && firstDiscovery) this.addXp(recipe.discoveryXp);
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
    this.updateCreatures(dt);
    this.combat.update(dt);
    this.playerMotion = { ...this.playerMotion, position: this.player.position };
    for (const c of this.creatures.values()) c.motion = { ...c.motion, position: c.combatant.position };
    for (const e of this.combat.drainEvents()) this.handleCombatEvent(e);
    this.updateDrops();
    this.processRespawns();
    this.applySchedules();
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
      this.playerMotion = stepMotion(base, cmd.move, dt, this.content.map, {
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
    this.addXp(r.xp);
  }

  /** Las criaturas fuera de su horario desaparecen si están lejos del jugador (no a la vista). */
  private applySchedules(): void {
    if (this.time < this.nextScheduleCheck) return;
    this.nextScheduleCheck = this.time + SCHEDULE_CHECK_SECONDS;
    const hour = this.hour;
    for (const c of [...this.creatures.values()]) {
      if (inHourRange(hour, c.def.spawnRules.activeHours)) continue;
      if (distance(c.combatant.position, this.player.position) <= ACTIVE_RADIUS) continue;
      this.creatures.delete(c.id);
      this.combat.remove(c.id);
      this.events.push({ type: 'despawned', id: c.id });
      const zone = this.content.map.spawnZones.find((z) => z.id === c.zoneId);
      if (zone) this.respawns.push({ zone, at: this.time + SCHEDULE_CHECK_SECONDS });
    }
  }

  private updateCreatures(dt: number): void {
    const target = this.player.alive ? this.player : null;
    for (const c of this.creatures.values()) {
      const self = c.combatant;
      if (!self.alive || distance(self.position, this.player.position) > ACTIVE_RADIUS) continue;
      const decision = c.brain.decide(self, target, this.time, this.rng);
      if (decision.face) {
        c.motion = { ...c.motion, moving: false, facing: directionFromScreenVector(cellToScreen(decision.face)) ?? c.motion.facing };
      }
      if (decision.attack && c.ability) {
        const used = this.combat.useAbility(self.id, c.ability, decision.attack);
        const facing = directionFromScreenVector(cellToScreen(decision.attack));
        c.motion = { ...c.motion, moving: false, facing: facing ?? c.motion.facing };
        if (used.ok) continue;
      }
      if (!self.canAct(this.time) || (decision.move.x === 0 && decision.move.y === 0)) {
        c.motion = { ...c.motion, moving: false };
        continue;
      }
      c.motion = stepMotionCells(c.motion, decision.move, dt, this.content.map, {
        moveSpeed: self.stats.speed * self.speedMultiplier * decision.speedFactor,
        colliderHalfSize: self.colliderHalfSize,
      });
      self.position = c.motion.position;
    }
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
    const c = this.creatures.get(e.targetId);
    if (!c) return;
    this.creatures.delete(c.id);
    this.combat.remove(c.id);
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
      this.addXp(xp);
      for (const loot of rollLoot(this.content.lootTables.get(c.def.lootTable), this.rng)) {
        const drop = this.drops.spawn(loot.itemId, loot.quantity, c.combatant.position, this.time, this.content.map, this.rng);
        this.events.push({ type: 'drop-spawned', drop });
      }
    }
    const zone = this.content.map.spawnZones.find((z) => z.id === c.zoneId);
    if (zone) this.respawns.push({ zone, at: this.time + c.def.spawnRules.respawnSeconds });
  }

  private processRespawns(): void {
    if (this.playerRespawnAt !== null && this.time >= this.playerRespawnAt) {
      this.playerRespawnAt = null;
      this.player.reset(this.content.map.spawn);
      this.playerMotion = { position: this.player.position, facing: 's', moving: false };
      this.events.push({ type: 'player-respawned' });
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (!r || this.time < r.at) continue;
      // Si no hay sitio válido (p. ej. el jugador está encima), se reintenta más tarde.
      if (this.spawnCreature(r.zone)) this.respawns.splice(i, 1);
      else r.at = this.time + 1;
    }
  }

  private findSpawnPoint(zone: SpawnZone, def: CreatureDefinition): Vec2 | null {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * zone.radius;
      const p = { x: zone.center.x + Math.cos(angle) * r, y: zone.center.y + Math.sin(angle) * r };
      if (collides(this.content.map, p, { halfSize: def.colliderHalfSize })) continue;
      if (def.habitat.length > 0) {
        const cx = Math.floor(p.x);
        const cy = Math.floor(p.y);
        const ground = this.content.map.tileAt('ground', cx, cy);
        const detail = this.content.map.tileAt('detail', cx, cy);
        if (!def.habitat.some((t) => t === ground || t === detail)) continue;
      }
      if (distance(p, this.player.position) < SPAWN_SAFE_DISTANCE) continue;
      return p;
    }
    return null;
  }

  private spawnCreature(zone: SpawnZone): boolean {
    const def = this.content.creatures.get(zone.creatureId);
    if (!inHourRange(this.hour, def.spawnRules.activeHours)) return false;
    const position = this.findSpawnPoint(zone, def);
    if (!position) return false;
    const id = `${zone.id}#${++this.serial}`;
    const [minLevel, maxLevel] = def.levelRange;
    const level = minLevel + Math.floor(this.rng() * (maxLevel - minLevel + 1));
    const combatant = new Combatant({
      id,
      team: def.category === 'fauna' ? 'wild' : 'hostile',
      position,
      stats: statsAtLevel(def.stats, def.statsPerLevel, level),
      level,
      hurtboxRadius: def.hurtboxRadius,
      colliderHalfSize: def.colliderHalfSize,
      invulnerabilityOnHit: 0,
      poise: def.poise,
      energyRegen: 0,
    });
    this.combat.add(combatant);
    this.creatures.set(id, {
      id,
      def,
      zoneId: zone.id,
      combatant,
      brain: new CreatureBrain(position, def.behavior, new Navigator(this.content.map, def.colliderHalfSize)),
      ability: def.abilities[0] ? this.content.abilities.get(def.abilities[0]) : null,
      level,
      motion: { position, facing: 's', moving: false },
    });
    this.events.push({ type: 'spawned', id, creatureId: def.id });
    return true;
  }
}

/** Comprueba referencias cruzadas entre los archivos de contenido. */
export function validateContentReferences(content: SimulationContent): string[] {
  const problems: string[] = [];
  const { abilities, statuses, creatures, profession, character, map, items, sets, lootTables } = content;
  const needItem = (where: string, id: string) => {
    if (!items.all.has(id)) problems.push(`${where}: objeto "${id}" inexistente`);
  };
  if (character.professionId !== profession.id)
    problems.push(`El personaje usa la profesión "${character.professionId}" pero se cargó "${profession.id}"`);
  for (const [slot, id] of Object.entries(profession.abilities)) {
    if (!abilities.all.has(id)) problems.push(`Profesión ${profession.id}.${slot}: habilidad "${id}" inexistente`);
  }
  for (const a of abilities.all.values()) {
    if (a.applyStatus && !statuses.all.has(a.applyStatus.statusId))
      problems.push(`Habilidad ${a.id}: estado "${a.applyStatus.statusId}" inexistente`);
  }
  for (const c of creatures.all.values()) {
    for (const id of c.abilities) if (!abilities.all.has(id)) problems.push(`Criatura ${c.id}: habilidad "${id}" inexistente`);
    if (!lootTables.all.has(c.lootTable)) problems.push(`Criatura ${c.id}: tabla de botín "${c.lootTable}" inexistente`);
  }
  for (const t of lootTables.all.values()) for (const e of t.entries) needItem(`Botín ${t.id}`, e.itemId);
  for (const set of sets.all.values()) {
    for (const id of set.pieces) {
      needItem(`Conjunto ${set.id}`, id);
      const setId = items.all.get(id)?.equip?.setId;
      if (items.all.has(id) && setId !== set.id) problems.push(`Conjunto ${set.id}: la pieza "${id}" declara setId "${String(setId)}"`);
    }
  }
  for (const it of items.all.values()) {
    const setId = it.equip?.setId;
    if (setId && !sets.all.get(setId)?.pieces.includes(it.id)) problems.push(`Objeto ${it.id}: no figura en el conjunto "${setId}"`);
  }
  for (const it of character.startingItems) needItem('Personaje (startingItems)', it.itemId);
  for (const id of character.startingEquipment) {
    needItem('Personaje (startingEquipment)', id);
    if (items.all.has(id) && !items.get(id).equip) problems.push(`Personaje: "${id}" no es equipable`);
  }
  for (const id of character.startingQuickSlots) if (id) needItem('Personaje (startingQuickSlots)', id);
  const tiles = map.catalog.tiles;
  for (const c of creatures.all.values()) {
    for (const t of c.habitat) if (!tiles.has(t)) problems.push(`Criatura ${c.id}: hábitat "${t}" no es un tile conocido`);
  }
  for (const pl of content.plants.all.values()) {
    needItem(`Planta ${pl.id}`, pl.itemId);
    if (items.all.has(pl.itemId) && items.get(pl.itemId).category !== 'ingredient')
      problems.push(`Planta ${pl.id}: el objeto "${pl.itemId}" debe ser un ingrediente`);
    for (const t of pl.conditions.terrain) if (!tiles.has(t)) problems.push(`Planta ${pl.id}: terreno "${t}" no es un tile conocido`);
    for (const other of pl.compatibilities) {
      if (!content.plants.all.has(other)) problems.push(`Planta ${pl.id}: compatibilidad "${other}" inexistente`);
    }
  }
  const { recipes, elements } = content;
  needItem('Alquimia (resultado fallido)', recipes.config.failedResult.itemId);
  for (const r of recipes.recipes.values()) {
    for (const i of r.ingredients) needItem(`Receta ${r.id}`, i.itemId);
    needItem(`Receta ${r.id} (resultado)`, r.result.itemId);
  }
  for (const e of elements.all.values()) {
    if (e.onHit && !statuses.all.has(e.onHit.statusId)) problems.push(`Elemento ${e.id}: estado "${e.onHit.statusId}" inexistente`);
  }
  for (const it of items.all.values()) {
    for (const ef of it.use?.effects ?? []) {
      if (ef.kind === 'applyStatus' && !statuses.all.has(ef.statusId)) problems.push(`Objeto ${it.id}: estado "${ef.statusId}" inexistente`);
      if (ef.kind === 'infusion' && !elements.all.has(ef.elementId)) problems.push(`Objeto ${it.id}: elemento "${ef.elementId}" inexistente`);
    }
  }
  for (const z of map.gatherZones) {
    if (!content.plants.all.has(z.plantId)) problems.push(`Mapa ${map.id}, zona ${z.id}: planta "${z.plantId}" inexistente`);
  }
  for (const z of map.spawnZones) {
    if (!creatures.all.has(z.creatureId)) problems.push(`Mapa ${map.id}, zona ${z.id}: criatura "${z.creatureId}" inexistente`);
  }
  return problems;
}
