import type { MotionParams } from '../movement/characterMotion.ts';
import { ID_PATTERN, Issues } from './validate.ts';

/** Configuración del personaje provisional (Fase 1). Atributos completos llegan en Fase 2. */
export interface CharacterConfig extends MotionParams {
  readonly id: string;
  readonly name: string;
  /** Radio, en celdas, que el personaje revela en la niebla de exploración. */
  readonly visionRadius: number;
}

export function parseCharacterConfig(raw: unknown, source: string): CharacterConfig {
  const issues = new Issues();
  const r = issues.record(raw, '$') ?? {};
  const cfg = {
    id: issues.string(r['id'], '$.id', { pattern: ID_PATTERN }),
    name: issues.string(r['name'], '$.name'),
    moveSpeed: issues.number(r['moveSpeed'], '$.moveSpeed', { min: 0.1, max: 20 }),
    colliderHalfSize: issues.number(r['colliderHalfSize'], '$.colliderHalfSize', { min: 0.05, max: 0.49 }),
    visionRadius: issues.number(r['visionRadius'], '$.visionRadius', { min: 1, max: 64 }),
  };
  issues.throwIfAny(source);
  return cfg as CharacterConfig;
}
