import Phaser from 'phaser';
import type { UseFailure } from '../../core/combat/combatWorld.ts';
import type { SimEvent } from '../../core/simulation/worldSimulation.ts';
import type { GameContent } from '../content.ts';
import { RARITY_COLORS } from '../rendering/itemIcons.ts';
import type { GameSession } from '../session.ts';
import { ActionBar } from '../ui/actionBar.ts';
import { Minimap } from '../ui/minimap.ts';
import { NotificationFeed } from '../ui/notifications.ts';
import { PlayerFrame } from '../ui/playerFrame.ts';
import { QuickSlotsView } from '../ui/quickSlots.ts';
import { ITEM_FAILURE_TEXT } from '../ui/texts.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

const MARGIN = 12;
const TEXT = { fontFamily: 'monospace', color: '#e6e1cf', stroke: '#000', strokeThickness: 3 } as const;
const FAILURE_TEXT: Readonly<Record<UseFailure, string>> = {
  energy: 'Energía insuficiente',
  cooldown: 'En recuperación',
  locked: 'Habilidad bloqueada',
  busy: '',
  dead: '',
};
const SLOT_KEYS = { basic: 'Clic', power1: '1', power2: '2', power3: '3', final: 'R', dodge: 'Esp' } as const;

/** HUD superpuesto, con cámara propia (no afectado por el seguimiento del mundo). */
export class HudScene extends Phaser.Scene {
  private session!: GameSession;
  private content!: GameContent;
  private minimap!: Minimap;
  private frame!: PlayerFrame;
  private actionBar!: ActionBar;
  private quickSlots!: QuickSlotsView;
  private feed!: NotificationFeed;
  private sectorLabel!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private notice!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private deathOverlay!: Phaser.GameObjects.Rectangle;
  private noticeUntil = 0;
  private bannerUntil = 0;

  constructor() {
    super(SceneKeys.Hud);
  }

  init(data: { session: GameSession }): void {
    this.session = data.session;
  }

  create(): void {
    this.content = this.registry.get(REGISTRY_CONTENT) as GameContent;
    const sim = this.session.sim;
    this.minimap = new Minimap(this, this.session);
    this.frame = new PlayerFrame(this, MARGIN, MARGIN, this.content.character.name, this.content.profession.name);
    this.actionBar = new ActionBar(
      this,
      (['basic', 'power1', 'power2', 'power3', 'final', 'dodge'] as const).map((slot) => ({
        slot,
        key: SLOT_KEYS[slot],
        ability: sim.abilityFor(slot),
      })),
    );
    this.quickSlots = new QuickSlotsView(this, ['Q', 'F']);
    this.feed = new NotificationFeed(this);
    this.sectorLabel = this.add.text(0, 0, '', { ...TEXT, fontSize: '13px' }).setOrigin(1, 0);
    this.hint = this.add
      .text(0, 0, 'WASD moverse · Clic atacar · 1 2 3 poderes · R final · Espacio evadir · Q F consumibles', {
        ...TEXT,
        fontSize: '11px',
        color: '#a9a596',
      })
      .setOrigin(0.5, 1);
    this.deathOverlay = this.add.rectangle(0, 0, 10, 10, 0x2a0000, 0.45).setOrigin(0).setVisible(false);
    this.notice = this.add.text(0, 0, '', { ...TEXT, fontSize: '20px', color: '#ffd0c0' }).setOrigin(0.5);
    this.banner = this.add
      .text(0, 0, '', { ...TEXT, fontSize: '30px', color: '#ffd84a', strokeThickness: 6, align: 'center' })
      .setOrigin(0.5);

    const offEvents = this.session.onEvent((e) => { this.onSimEvent(e); });
    this.layout(this.scale.width, this.scale.height);
    this.scale.on('resize', (size: Phaser.Structs.Size) => { this.layout(size.width, size.height); }, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offEvents();
      this.scale.off('resize', undefined, this);
      this.minimap.destroy();
    });
  }

  private itemName(itemId: string): string {
    return this.content.items.get(itemId).name;
  }

  private onSimEvent(e: SimEvent): void {
    const now = this.session.sim.time;
    switch (e.type) {
      case 'action-failed': {
        this.actionBar.flash(e.slot, now);
        const text = FAILURE_TEXT[e.reason];
        if (text) this.showNotice(text, 0.9);
        break;
      }
      case 'player-died':
        this.deathOverlay.setVisible(true);
        this.showNotice('Has caído. Reapareciendo…', 3);
        break;
      case 'player-respawned':
        this.deathOverlay.setVisible(false);
        this.noticeUntil = 0;
        break;
      case 'xp-gained':
        this.feed.push(`+${e.amount} XP`, '#9fe870', now);
        break;
      case 'level-up': {
        const unlocked = e.unlockedAbilities.map((id) => this.content.abilities.get(id).name);
        this.banner.setText(`¡Nivel ${e.level}!${unlocked.length > 0 ? `\nNueva habilidad: ${unlocked.join(', ')}` : ''}`);
        this.bannerUntil = now + 3;
        for (const name of unlocked) this.feed.push(`Nueva habilidad: ${name}`, '#ffd84a', now);
        break;
      }
      case 'drop-collected': {
        const rarity = this.content.items.get(e.itemId).rarity;
        const color = `#${RARITY_COLORS[rarity].toString(16).padStart(6, '0')}`;
        this.feed.push(`+${e.quantity} ${this.itemName(e.itemId)}`, color, now);
        break;
      }
      case 'inventory-full':
        this.showNotice('Inventario lleno', 1.5);
        break;
      case 'item-used':
        this.feed.push(`Usaste ${this.itemName(e.itemId)}`, '#c9c3b0', now);
        break;
      case 'item-failed': {
        const text = e.itemId === null && e.reason === 'missing' ? 'Ranura rápida vacía' : ITEM_FAILURE_TEXT[e.reason];
        if (text && !this.session.paused) this.showNotice(text, 1.2);
        break;
      }
      default:
        break;
    }
  }

  private showNotice(text: string, seconds: number): void {
    this.notice.setText(text);
    this.noticeUntil = this.session.sim.time + seconds;
  }

  private layout(width: number, height: number): void {
    this.minimap.layout(width - MARGIN, MARGIN);
    this.sectorLabel.setPosition(width - MARGIN, MARGIN + this.minimap.height + 18);
    this.feed.layout(width - MARGIN, MARGIN + this.minimap.height + 40);
    this.actionBar.layout(width / 2, height - MARGIN - 16);
    this.quickSlots.layout(width - MARGIN, height - MARGIN);
    this.hint.setPosition(width / 2, height - 6);
    this.notice.setPosition(width / 2, height * 0.3);
    this.banner.setPosition(width / 2, height * 0.2);
    this.deathOverlay.setSize(width, height);
  }

  override update(): void {
    const sim = this.session.sim;
    const now = sim.time;
    this.minimap.update();
    this.frame.update(sim.player, sim.character);
    this.actionBar.update(sim.player, now);
    this.quickSlots.update(sim.character, now);
    this.feed.update(now);
    this.notice.setVisible(now < this.noticeUntil);
    this.banner.setVisible(now < this.bannerUntil);
    if (now < this.bannerUntil) this.banner.setAlpha(Math.min(1, this.bannerUntil - now));
    const { position } = this.session.player;
    this.sectorLabel.setText(`${this.session.map.name}  (${Math.floor(position.x)}, ${Math.floor(position.y)})`);
  }
}
