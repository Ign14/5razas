/** Reasignación de teclas (GAME_DESIGN §12: las teclas deberán ser configurables). Sin dependencia de Phaser. */

export type BindingMap = Readonly<Record<string, readonly string[]>>;

/** Teclas que no se pueden reasignar porque abren el menú (siempre debe haber una salida). */
export const RESERVED_KEYS: readonly string[] = ['ESC'];

export type RebindResult =
  | { readonly ok: true; readonly bindings: BindingMap }
  | { readonly ok: false; readonly reason: 'reserved' | 'unknown-action' }
  | { readonly ok: false; readonly reason: 'conflict'; readonly conflictWith: string };

/**
 * Asigna `key` como tecla principal de `action` (las alternativas se conservan). Rechaza teclas
 * reservadas y las que ya usa otra acción, para no dejar dos acciones en la misma tecla.
 */
export function rebind(bindings: BindingMap, action: string, key: string): RebindResult {
  const current = bindings[action];
  if (!current) return { ok: false, reason: 'unknown-action' };
  if (RESERVED_KEYS.includes(key)) return { ok: false, reason: 'reserved' };
  for (const [other, keys] of Object.entries(bindings)) {
    if (other !== action && keys.includes(key)) return { ok: false, reason: 'conflict', conflictWith: other };
  }
  const rest = current.slice(1).filter((k) => k !== key);
  return { ok: true, bindings: { ...bindings, [action]: [key, ...rest] } };
}

/**
 * Combina las asignaciones guardadas con las predeterminadas: acciones nuevas toman su valor por
 * defecto y las teclas desconocidas se descartan (migración tolerante de configuraciones antiguas).
 */
export function mergeBindings(defaults: BindingMap, saved: unknown, isKnownKey: (k: string) => boolean): BindingMap {
  if (typeof saved !== 'object' || saved === null) return defaults;
  const out: Record<string, readonly string[]> = {};
  for (const [action, def] of Object.entries(defaults)) {
    const raw = (saved as Record<string, unknown>)[action];
    const keys = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string' && isKnownKey(k)) : [];
    out[action] = keys.length > 0 ? keys : def;
  }
  return out;
}
