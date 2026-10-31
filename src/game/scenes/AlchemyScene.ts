import Phaser from 'phaser';
import { combinedProperties, totalUnits, type IngredientStack } from '../../core/alchemy/alchemy.ts';
import type { AlchemyFailure } from '../../core/simulation/worldSimulation.ts';
import type { GameContent } from '../content.ts';
import { itemIconKey } from '../rendering/itemIcons.ts';
import type { GameSession } from '../session.ts';
import { describeEffect } from '../ui/texts.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

const PANEL_W = 880;
const PANEL_H = 490;
const TEXT = { fontFamily: 'monospace', color: '#e6e1cf' } as const;
const ELEMENT_NAMES: Readonly<Record<string, string>> = {
  fire: 'Fuego',
  ice: 'Hielo',
  poison: 'Veneno',
  lightning: 'Electricidad',
  wind: 'Viento',
  vital: 'Vital',
};
const FAILURE_TEXT: Readonly<Record<AlchemyFailure, string>> = {
  'too-few': 'Agrega al menos dos ingredientes',
  'too-many': 'El mortero está lleno',
  'missing-ingredients': 'No tienes suficientes ingredientes',
  'invalid-ingredient': 'Ese objeto no sirve para la alquimia',
  dead: '',
};

/**
 * Alquimia (GAME_DESIGN §10): mortero para experimentar, propiedades combinadas como pista
 * y libro de descubrimientos. Pausa el juego mientras está abierta.
 */
export class AlchemyScene extends Phaser.Scene {
  private session!: GameSession;
  private content!: GameContent;
  private layer!: Phaser.GameObjects.Container;
  private mortar: string[] = [];
  private message = '';
  private messageColor = '#e6e1cf';

  constructor() {
    super(SceneKeys.Alchemy);
  }

  init(data: { session: GameSession }): void {
    this.session = data.session;
    this.mortar = [];
    this.message = '';
  }

  create(): void {
    this.content = this.registry.get(REGISTRY_CONTENT) as GameContent;
    this.session.paused = true;
    this.layer = this.add.container(0, 0);
    this.input.keyboard?.on('keydown-ESC', () => { this.close(); });
    this.scale.on('resize', () => { this.render(); }, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', undefined, this);
      this.session.paused = false;
    });
    this.render();
  }

  close(): void {
    this.session.paused = false;
    this.scene.stop();
  }

  private text(x: number, y: number, s: string, size = 12, color = '#e6e1cf'): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, { ...TEXT, fontSize: `${size}px`, color });
    this.layer.add(t);
    return t;
  }

  private button(x: number, y: number, label: string, onClick: () => void, w = 120, enabled = true): void {
    const r = this.add.rectangle(x, y, w, 24, enabled ? 0x2a3140 : 0x1a1d24).setOrigin(0).setStrokeStyle(1, enabled ? 0xc9a85a : 0x3a3f4a);
    if (enabled) {
      r.setInteractive({ useHandCursor: true })
        .on('pointerover', () => r.setFillStyle(0x3a4458))
        .on('pointerout', () => r.setFillStyle(0x2a3140))
        .on('pointerdown', onClick);
    }
    this.layer.add(r);
    this.text(x + w / 2, y + 5, label, 12, enabled ? '#e6e1cf' : '#6a6f7c').setOrigin(0.5, 0);
  }

  /** Ingredientes en el mortero, agrupados. */
  private get stacks(): IngredientStack[] {
    const totals = new Map<string, number>();
    for (const id of this.mortar) totals.set(id, (totals.get(id) ?? 0) + 1);
    return [...totals].map(([itemId, quantity]) => ({ itemId, quantity }));
  }

  /** Unidades disponibles de un objeto descontando las que ya están en el mortero. */
  private available(itemId: string): number {
    return this.session.sim.character.inventory.count(itemId) - this.mortar.filter((m) => m === itemId).length;
  }

  private render(): void {
    this.layer.removeAll(true);
    const sim = this.session.sim;
    const { items, recipes, plants } = this.content;
    const ox = Math.round((this.scale.width - PANEL_W) / 2);
    const oy = Math.max(8, Math.round((this.scale.height - PANEL_H) / 2) - 20);
    const maxUnits = recipes.config.maxUnits;

    this.layer.add(this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55).setOrigin(0).setInteractive());
    this.layer.add(this.add.rectangle(ox, oy, PANEL_W, PANEL_H, 0x0b0d12, 0.96).setOrigin(0).setStrokeStyle(2, 0xc9a85a));
    this.button(ox + PANEL_W - 96, oy + 10, 'Cerrar (K)', () => { this.close(); }, 84);

    // --- Ingredientes disponibles ---
    this.text(ox + 16, oy + 12, 'Ingredientes', 16, '#e8c872');
    const seen = new Set<string>();
    let row = 0;
    for (const s of sim.character.inventory.contents) {
      if (!s || seen.has(s.itemId)) continue;
      const def = items.get(s.itemId);
      if (def.category !== 'ingredient' && def.category !== 'material') continue;
      seen.add(s.itemId);
      const y = oy + 42 + row * 24;
      row++;
      const count = this.available(s.itemId);
      const r = this.add.rectangle(ox + 14, y - 2, 270, 22, 0x161a22).setOrigin(0).setStrokeStyle(1, 0x2a2f3a);
      if (count > 0 && this.mortar.length < maxUnits) {
        r.setInteractive({ useHandCursor: true })
          .on('pointerover', () => r.setFillStyle(0x232a36))
          .on('pointerout', () => r.setFillStyle(0x161a22))
          .on('pointerdown', () => {
            this.mortar.push(s.itemId);
            this.message = '';
            this.render();
          });
      }
      this.layer.add(r);
      this.layer.add(this.add.image(ox + 26, y + 9, itemIconKey(s.itemId)).setScale(0.75));
      this.text(ox + 40, y + 2, `${def.name} ×${count}`, 11, count > 0 ? '#e6e1cf' : '#6a6f7c');
      const plant = [...plants.all.values()].find((p) => p.itemId === s.itemId);
      if (plant) {
        const props = plant.properties.map((pr) => `${ELEMENT_NAMES[pr.element] ?? pr.element} ${pr.potency}`).join(' ');
        this.text(ox + 280, y + 3, props, 10, '#a9a596').setOrigin(1, 0);
      }
      if (row >= 17) break;
    }
    if (row === 0) this.text(ox + 16, oy + 44, 'Recolecta plantas (E) o caza\npara obtener ingredientes.', 11, '#7a7f8c');

    // --- Mortero ---
    const mx = ox + 310;
    this.text(mx, oy + 12, 'Mortero', 16, '#e8c872');
    for (let i = 0; i < maxUnits; i++) {
      const sx = mx + i * 58;
      const id = this.mortar[i];
      const box = this.add.rectangle(sx, oy + 44, 52, 52, 0x161a22).setOrigin(0).setStrokeStyle(1, id ? 0xf2d16b : 0x3a3f4a);
      if (id) {
        box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          this.mortar.splice(i, 1);
          this.render();
        });
      }
      this.layer.add(box);
      if (id) this.layer.add(this.add.image(sx + 26, oy + 70, itemIconKey(id)).setScale(1.6));
    }
    const props = combinedProperties(this.stacks, plants);
    this.text(mx, oy + 106, props.length > 0 ? `Propiedades: ${props.map((p) => `${ELEMENT_NAMES[p.element] ?? p.element} ${p.potency}`).join(' · ')}` : 'Propiedades: —', 11, '#a9a596');
    const units = totalUnits(this.stacks);
    this.button(mx, oy + 130, 'Combinar', () => { this.combine(); }, 120, units >= 2);
    this.button(mx + 130, oy + 130, 'Vaciar', () => {
      this.mortar = [];
      this.message = '';
      this.render();
    }, 100, units > 0);
    if (this.message) this.text(mx, oy + 166, this.message, 12, this.messageColor).setWordWrapWidth(240);
    this.text(mx, oy + PANEL_H - 52, 'Las combinaciones sin receta consumen\nlos ingredientes y dan un resultado menor.', 10, '#6a6f7c');

    // --- Libro de descubrimientos ---
    const bx = ox + 570;
    this.text(bx, oy + 12, `Descubrimientos (${sim.discoveries.size}/${recipes.recipes.size})`, 14, '#e8c872');
    let by = oy + 42;
    for (const recipe of recipes.recipes.values()) {
      const known = sim.discoveries.has(recipe.id);
      if (!known) {
        this.text(bx, by, '??? — receta sin descubrir', 11, '#5a5f6c');
        by += 20;
        continue;
      }
      this.text(bx, by, recipe.name, 12, '#9fe870');
      const ingredients = recipe.ingredients.map((i) => `${items.get(i.itemId).name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(' + ');
      this.text(bx + 8, by + 15, ingredients, 10, '#a9a596').setWordWrapWidth(290);
      const effects = items.get(recipe.result.itemId).use?.effects ?? [];
      this.text(bx + 8, by + 28, effects.map((e) => describeEffect(e, this.content)).join(', '), 10, '#c9c3b0').setWordWrapWidth(220);
      const can = recipe.ingredients.every((i) => sim.character.inventory.count(i.itemId) >= i.quantity);
      this.button(bx + 228, by + 14, 'Preparar', () => {
        this.mortar = recipe.ingredients.flatMap((i) => new Array<string>(i.quantity).fill(i.itemId));
        this.combine();
      }, 70, can);
      by += 46;
    }
  }

  private combine(): void {
    const r = this.session.sim.experiment(this.stacks);
    this.mortar = [];
    if (!r.ok) {
      this.message = FAILURE_TEXT[r.reason];
      this.messageColor = '#ff6a5a';
    } else if (r.recipeId) {
      const name = this.content.items.get(r.itemId).name;
      this.message = r.firstDiscovery ? `¡Descubriste ${name}!` : `Preparaste ${name}.`;
      this.messageColor = '#9fe870';
    } else {
      const top = r.properties[0];
      this.message =
        `La mezcla no funcionó: obtuviste ${this.content.items.get(r.itemId).name}.` +
        (top ? ` Predominaba ${ELEMENT_NAMES[top.element] ?? top.element}.` : '');
      this.messageColor = '#f2d16b';
    }
    this.render();
  }
}
