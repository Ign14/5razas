import { HEX_COLOR_PATTERN, ID_PATTERN, Issues } from '../data/validate.ts';

/**
 * Modificadores elementales de los ataques (GAME_DESIGN §10.3). Son mecánicas fantásticas,
 * no propiedades históricas de los pueblos representados.
 */
export interface ElementDefinition {
  readonly id: string;
  readonly name: string;
  /** Color de los efectos visuales del elemento. */
  readonly color: string;
  /** Estado que puede aplicar cada impacto de una habilidad compatible. */
  readonly onHit: { readonly statusId: string; readonly chance: number } | null;
  /** Retroceso adicional (celdas) en cada impacto compatible. */
  readonly bonusKnockback: number;
}

export interface ElementCatalog {
  readonly all: ReadonlyMap<string, ElementDefinition>;
  get(id: string): ElementDefinition;
}

export function parseElementCatalog(raw: unknown, source: string): ElementCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const all = new Map<string, ElementDefinition>();
  issues.array(root?.['elements'], '$.elements')?.forEach((entry, i) => {
    const p = `$.elements[${i}]`;
    const e = issues.record(entry, p);
    if (!e) return;
    const before = issues.count;
    let onHit: ElementDefinition['onHit'] = null;
    if (e['onHit'] !== null && e['onHit'] !== undefined) {
      const o = issues.record(e['onHit'], `${p}.onHit`) ?? {};
      onHit = {
        statusId: issues.string(o['statusId'], `${p}.onHit.statusId`, { pattern: ID_PATTERN }) ?? '',
        chance: issues.number(o['chance'], `${p}.onHit.chance`, { min: 0, max: 1 }) ?? 0,
      };
    }
    const def = {
      id: issues.string(e['id'], `${p}.id`, { pattern: ID_PATTERN }),
      name: issues.string(e['name'], `${p}.name`),
      color: issues.string(e['color'], `${p}.color`, { pattern: HEX_COLOR_PATTERN }),
      onHit,
      bonusKnockback: issues.number(e['bonusKnockback'], `${p}.bonusKnockback`, { min: 0, max: 8 }),
    };
    if (def.id && all.has(def.id)) issues.add(`${p}.id`, `identificador duplicado "${def.id}"`);
    if (issues.count === before) all.set(def.id as string, def as ElementDefinition);
  });
  issues.throwIfAny(source);
  return {
    all,
    get(id) {
      const d = all.get(id);
      if (!d) throw new Error(`Elemento desconocido: "${id}"`);
      return d;
    },
  };
}
