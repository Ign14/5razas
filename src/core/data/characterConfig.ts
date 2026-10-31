import { ID_PATTERN, Issues } from './validate.ts';

/**
 * Configuración del personaje controlado. Los atributos (incluida la velocidad) provienen de la
 * profesión elegida.
 */
export interface CharacterConfig {
  readonly id: string;
  readonly name: string;
  readonly professionId: string;
  readonly colliderHalfSize: number;
  /** Radio, en celdas, que el personaje revela en la niebla de exploración. */
  readonly visionRadius: number;
}

export function parseCharacterConfig(raw: unknown, source: string): CharacterConfig {
  const issues = new Issues();
  const r = issues.record(raw, '$') ?? {};
  const cfg = {
    id: issues.string(r['id'], '$.id', { pattern: ID_PATTERN }),
    name: issues.string(r['name'], '$.name'),
    professionId: issues.string(r['professionId'], '$.professionId', { pattern: ID_PATTERN }),
    colliderHalfSize: issues.number(r['colliderHalfSize'], '$.colliderHalfSize', { min: 0.05, max: 0.49 }),
    visionRadius: issues.number(r['visionRadius'], '$.visionRadius', { min: 1, max: 64 }),
  };
  issues.throwIfAny(source);
  return cfg as CharacterConfig;
}
