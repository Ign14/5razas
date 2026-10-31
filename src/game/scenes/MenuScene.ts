import Phaser from 'phaser';
import { loadSave, type SaveData } from '../../core/persistence/saveGame.ts';
import { IndexedDbSaveStorage, SAVE_SLOT } from '../persistence/indexedDbStorage.ts';
import { SceneKeys } from './keys.ts';

const TEXT = { fontFamily: 'monospace' } as const;

/** Pantalla inicial: continuar la partida guardada o empezar una nueva (GAME_DESIGN §15). */
export class MenuScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  private save: SaveData | null = null;
  private status = 'Buscando partida guardada…';

  constructor() {
    super(SceneKeys.Menu);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0d0f14');
    this.save = null;
    this.render();
    this.scale.on('resize', () => { this.render(); }, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', undefined, this));
    this.input.keyboard?.on('keydown-ENTER', () => { this.start(this.save); });

    void new IndexedDbSaveStorage()
      .load(SAVE_SLOT)
      .then((raw) => {
        if (raw === null) {
          this.status = '';
          return;
        }
        const r = loadSave(raw);
        if (r.ok) {
          this.save = r.save;
          this.status = '';
        } else {
          console.warn('Guardado inválido:', r.issues);
          this.status = 'La partida guardada está dañada y no puede cargarse.';
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        this.status = 'No se pudo acceder al almacenamiento local.';
      })
      .finally(() => {
        if (this.scene.isActive()) this.render();
      });
  }

  private start(save: SaveData | null): void {
    this.scene.start(SceneKeys.Game, { save });
  }

  private button(x: number, y: number, label: string, onClick: () => void): void {
    const r = this.add.rectangle(x, y, 280, 34, 0x1c2230).setStrokeStyle(1, 0xc9a85a);
    r.setInteractive({ useHandCursor: true })
      .on('pointerover', () => r.setFillStyle(0x2a3344))
      .on('pointerout', () => r.setFillStyle(0x1c2230))
      .on('pointerdown', onClick);
    const t = this.add.text(x, y, label, { ...TEXT, fontSize: '16px', color: '#e6e1cf' }).setOrigin(0.5);
    this.items.push(r, t);
  }

  private render(): void {
    for (const o of this.items) o.destroy();
    this.items = [];
    const { width, height } = this.scale;
    this.items.push(
      this.add
        .text(width / 2, height * 0.3, '5RAZAS', { ...TEXT, fontSize: '72px', color: '#e8c872', stroke: '#3a2a12', strokeThickness: 8 })
        .setOrigin(0.5),
    );
    let y = height * 0.52;
    if (this.save) {
      const date = new Date(this.save.savedAt).toLocaleString('es');
      this.button(width / 2, y, 'Continuar partida', () => { this.start(this.save); });
      this.items.push(this.add.text(width / 2, y + 24, `Guardada: ${date}`, { ...TEXT, fontSize: '11px', color: '#7a7f8c' }).setOrigin(0.5, 0));
      y += 64;
    }
    this.button(width / 2, y, 'Nueva partida', () => { this.start(null); });
    const hint = this.save ? 'ENTER: continuar' : 'ENTER o clic: comenzar';
    this.items.push(this.add.text(width / 2, y + 40, hint, { ...TEXT, fontSize: '13px', color: '#a9a596' }).setOrigin(0.5, 0));
    if (this.status) this.items.push(this.add.text(width / 2, y + 64, this.status, { ...TEXT, fontSize: '12px', color: '#ff9a7a' }).setOrigin(0.5, 0));
    this.items.push(
      this.add
        .text(width / 2, height - 24, `v${__APP_VERSION__} · vertical slice · arte provisional`, { ...TEXT, fontSize: '12px', color: '#7a7f8c' })
        .setOrigin(0.5),
    );
  }
}
