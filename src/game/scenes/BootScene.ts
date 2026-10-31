import Phaser from 'phaser';
import { loadContent } from '../content.ts';
import {
  createCreatureTextures,
  createPlaceholderTextures,
  createNarrativeTextures,
  createPlantTextures,
  createPlayerAnimations,
} from '../rendering/placeholderTextures.ts';
import { createItemIcons } from '../rendering/itemIcons.ts';
import { defaultSettings, REGISTRY_SETTINGS } from '../input/settings.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

/** Valida el contenido y prepara recursos compartidos. Si los datos son inválidos, lo muestra. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    try {
      const content = loadContent();
      this.registry.set(REGISTRY_CONTENT, content);
      this.registry.set(REGISTRY_SETTINGS, defaultSettings(content.controlsRaw));
      createPlaceholderTextures(this, content.catalog);
      createPlayerAnimations(this);
      createCreatureTextures(this, [...content.creatures.all.values()].map((c) => c.spriteAtlas));
      createItemIcons(this, content.items);
      createNarrativeTextures(this, [...content.narrative.npcs.values()].map((n) => n.spriteAtlas));
      createPlantTextures(
        this,
        [...content.plants.all.values()].map((p) => ({ id: p.id, ...content.items.get(p.itemId).icon })),
      );
      this.scene.start(SceneKeys.Menu);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(error);
      this.add
        .text(16, 16, `Error al cargar el contenido:\n\n${message}`, {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ff8080',
          wordWrap: { width: this.scale.width - 32 },
        })
        .setName('boot-error');
    }
  }
}
