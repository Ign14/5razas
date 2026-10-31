import Phaser from 'phaser';
import { loadContent } from '../content.ts';
import { createPlaceholderTextures, createPlayerAnimations } from '../rendering/placeholderTextures.ts';
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
      createPlaceholderTextures(this, content.catalog);
      createPlayerAnimations(this);
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
