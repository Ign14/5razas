import type Phaser from 'phaser';
import type { HitArea } from '../../core/combat/hitShapes.ts';
import { cellToScreen, type IsoMetrics } from '../../core/math/iso.ts';
import type { Vec2 } from '../../core/math/vector.ts';
import { OVERLAY_DEPTH } from './depth.ts';

/** Colores provisionales por clave de efecto visual (campo `vfx` de las habilidades). */
const VFX_COLORS: Readonly<Record<string, number>> = {
  slash: 0xf2f0e6,
  charge: 0xf2d16b,
  whirl: 0xbfe3a0,
  barrier: 0x7fd3ff,
  tempest: 0x9fe870,
  dodge: 0xffffff,
  'enemy-slash': 0xff5a4a,
  'enemy-dive': 0xff8a3a,
};
const DEFAULT_COLOR = 0xffffff;

/** Muestrea el contorno de un área (en celdas) y lo proyecta a pantalla. */
export function areaOutline(area: HitArea, iso: IsoMetrics): Vec2[] {
  const pts: Vec2[] = [];
  const steps = 28;
  switch (area.shape) {
    case 'circle':
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        pts.push({ x: area.center.x + Math.cos(a) * area.radius, y: area.center.y + Math.sin(a) * area.radius });
      }
      break;
    case 'arc': {
      const base = Math.atan2(area.dir.y, area.dir.x);
      pts.push(area.center);
      for (let i = 0; i <= steps; i++) {
        const a = base - area.halfAngle + (i / steps) * area.halfAngle * 2;
        pts.push({ x: area.center.x + Math.cos(a) * area.radius, y: area.center.y + Math.sin(a) * area.radius });
      }
      break;
    }
    case 'line': {
      const { from, dir, length, halfWidth } = area;
      const n = { x: -dir.y * halfWidth, y: dir.x * halfWidth };
      const to = { x: from.x + dir.x * length, y: from.y + dir.y * length };
      pts.push({ x: from.x + n.x, y: from.y + n.y }, { x: to.x + n.x, y: to.y + n.y });
      pts.push({ x: to.x - n.x, y: to.y - n.y }, { x: from.x - n.x, y: from.y - n.y });
      break;
    }
  }
  return pts.map((p) => cellToScreen(p, iso));
}

/** Efectos de combate: áreas de impacto, telegrafías y números de daño (con pooling). */
export class CombatEffects {
  private readonly scene: Phaser.Scene;
  private readonly iso: IsoMetrics;
  private readonly textPool: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, iso: IsoMetrics) {
    this.scene = scene;
    this.iso = iso;
  }

  /** Dibuja un área; `telegraph` la muestra como aviso durante `duration` segundos. */
  showArea(area: HitArea, vfx: string, duration: number, telegraph: boolean, colorOverride: string | null = null): void {
    const color = colorOverride ? parseInt(colorOverride.slice(1), 16) : (VFX_COLORS[vfx] ?? DEFAULT_COLOR);
    const g = this.scene.add.graphics().setDepth(telegraph ? 3 : OVERLAY_DEPTH - 2);
    const pts = areaOutline(area, this.iso);
    g.fillStyle(color, telegraph ? 0.18 : 0.35).fillPoints(pts, true);
    g.lineStyle(telegraph ? 1 : 2, color, telegraph ? 0.8 : 0.9).strokePoints(pts, true);
    this.scene.tweens.add({
      targets: g,
      alpha: telegraph ? { from: 0.6, to: 1 } : 0,
      duration: Math.max(60, duration * 1000),
      onComplete: () => { g.destroy(); },
    });
  }

  /** Número flotante de daño o texto breve (p. ej. "Esquiva") en una posición de celdas. */
  floatText(at: Vec2, text: string, color: string, big = false): void {
    const p = cellToScreen(at, this.iso);
    const t = this.textPool.pop() ?? this.scene.add.text(0, 0, '', { fontFamily: 'monospace' }).setOrigin(0.5);
    t.setText(text)
      .setPosition(p.x + (Math.random() - 0.5) * 12, p.y - 34)
      .setStyle({ fontFamily: 'monospace', fontSize: big ? '18px' : '13px', color, stroke: '#000', strokeThickness: 3 })
      .setDepth(OVERLAY_DEPTH)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 26,
      alpha: 0,
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        t.setActive(false).setVisible(false);
        this.textPool.push(t);
      },
    });
  }
}
