import { cellToScreen } from '../../core/math/iso.ts';
import { directionAngle } from '../../core/movement/direction.ts';
import type { GameContent } from '../content.ts';
import type { GameSession } from '../session.ts';
import { computeMarkers, MARKER_COLORS, type MarkerKind } from '../ui/mapMarkers.ts';
import { MINIMAP_TEXTURE_KEY } from '../ui/minimap.ts';
import { PanelScene } from '../ui/panel.ts';
import { REGISTRY_CONTENT, SceneKeys } from './keys.ts';

/** Escala del mapa ampliado respecto del minimapa (rombos de 4 × 2 px por celda). */
const ZOOM = 3;
const LEGEND: readonly [MarkerKind | 'player', string][] = [
  ['player', 'Tú'],
  ['npc', 'Personaje'],
  ['npc-quest', 'Misión disponible o por entregar'],
  ['objective', 'Objetivo de misión'],
  ['boss', 'Enemigo especial detectado'],
];

/** Mapa del territorio completo (tecla M, GAME_DESIGN §3.4), con la niebla de exploración. */
export class MapScene extends PanelScene {
  private game$!: GameSession;
  private content!: GameContent;

  constructor() {
    super(SceneKeys.Map);
  }

  init(data: { session: GameSession }): void {
    this.game$ = data.session;
  }

  create(): void {
    this.content = this.registry.get(REGISTRY_CONTENT) as GameContent;
    this.open(this.game$);
    this.render();
  }

  protected render(): void {
    const map = this.game$.map;
    const mini = { tileWidth: 4 * ZOOM, tileHeight: 2 * ZOOM };
    const mapW = (map.width + map.height) * (mini.tileWidth / 2);
    const mapH = (map.width + map.height) * (mini.tileHeight / 2);
    const scale = Math.min(1, (this.scale.width - 80) / mapW, (this.scale.height - 150) / mapH);
    const w = mapW * scale + 40;
    const h = mapH * scale + 110;
    const { x, y } = this.panel(w, h, 0.7);
    this.text(x + 20, y + 12, `${map.name} — ${this.game$.exploration.exploredCount} de ${map.width * map.height} celdas exploradas`, 14, '#e8c872');
    this.button(x + w - 110, y + 8, 'Cerrar (M)', () => { this.close(); }, 96);

    const ox = x + 20;
    const oy = y + 44;
    this.layer.add(this.add.image(ox, oy, MINIMAP_TEXTURE_KEY).setOrigin(0).setScale(ZOOM * scale));
    const toMap = (p: { x: number; y: number }) => {
      const s = cellToScreen(p, mini);
      return { x: ox + (s.x + map.height * (mini.tileWidth / 2)) * scale, y: oy + s.y * scale };
    };
    const g = this.add.graphics();
    this.layer.add(g);
    for (const m of computeMarkers(this.game$, this.content.narrative)) {
      const p = toMap(m.at);
      g.fillStyle(0x000000, 0.8).fillCircle(p.x, p.y, 7);
      g.fillStyle(MARKER_COLORS[m.kind], 1).fillCircle(p.x, p.y, 5);
    }
    const player = this.game$.player;
    const pp = toMap(player.position);
    const a = directionAngle(player.facing);
    const tip = (r: number, da: number) => ({ x: pp.x + Math.cos(a + da) * r, y: pp.y + Math.sin(a + da) * r });
    const [t0, t1, t2] = [tip(11, 0), tip(7, 2.4), tip(7, -2.4)];
    g.fillStyle(0xffffff, 1).fillTriangle(t0.x, t0.y, t1.x, t1.y, t2.x, t2.y);
    g.fillStyle(0xe8483a, 1).fillCircle(pp.x, pp.y, 4);

    let lx = x + 20;
    for (const [kind, label] of LEGEND) {
      g.fillStyle(kind === 'player' ? 0xe8483a : MARKER_COLORS[kind], 1).fillCircle(lx + 5, y + h - 30, 5);
      lx += 16 + this.text(lx + 14, y + h - 37, label, 11, '#c9c3b0').width + 18;
    }
  }
}
