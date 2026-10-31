import { dot, length, sub, type Vec2 } from '../math/vector.ts';

/** Área de impacto resuelta en el espacio de celdas (hitbox). */
export type HitArea =
  | { readonly shape: 'arc'; readonly center: Vec2; readonly dir: Vec2; readonly radius: number; readonly halfAngle: number }
  | { readonly shape: 'circle'; readonly center: Vec2; readonly radius: number }
  | { readonly shape: 'line'; readonly from: Vec2; readonly dir: Vec2; readonly length: number; readonly halfWidth: number };

/** ¿El hurtbox circular (centro p, radio r) intersecta el área? `dir` debe estar normalizado. */
export function overlapsHurtbox(area: HitArea, p: Vec2, r: number): boolean {
  switch (area.shape) {
    case 'circle':
      return length(sub(p, area.center)) <= area.radius + r;
    case 'arc': {
      const d = sub(p, area.center);
      const dist = length(d);
      if (dist > area.radius + r) return false;
      if (dist <= r) return true; // El objetivo envuelve al lanzador.
      const cos = dot(d, area.dir) / dist;
      const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
      // Tolerancia angular equivalente al radio del hurtbox.
      return angle <= area.halfAngle + Math.asin(Math.min(1, r / dist));
    }
    case 'line': {
      const d = sub(p, area.from);
      const t = dot(d, area.dir);
      if (t < -r || t > area.length + r) return false;
      const perp = Math.abs(d.x * area.dir.y - d.y * area.dir.x);
      return perp <= area.halfWidth + r;
    }
  }
}
