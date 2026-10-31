import type { Rng } from '../math/random.ts';
import type { DamageType } from './abilities.ts';
import type { Stats } from './stats.ts';

export const CRIT_MULTIPLIER = 1.5;

export interface DamageInput {
  readonly attacker: Stats;
  readonly defender: Stats;
  readonly damageType: DamageType;
  readonly multiplier: number;
  /** Multiplicador por estados del objetivo (p. ej. protección). */
  readonly damageTakenMultiplier: number;
  readonly rng: Rng;
}

export type DamageResult =
  | { readonly evaded: true; readonly amount: 0; readonly crit: false }
  | { readonly evaded: false; readonly amount: number; readonly crit: boolean };

/**
 * Fórmula de daño (balance en datos, no en código de combate):
 *   base   = (physical ? Ataque : Poder) × multiplicador
 *   mitig. = 100 / (100 + Defensa)   — el daño de poder ignora la mitad de la Defensa
 *   crit   = × 1,5 con probabilidad Crítico; evasión con probabilidad Evasión.
 * El orden de las tiradas es fijo (evasión, luego crítico) para mantener el determinismo.
 */
export function computeDamage(input: DamageInput): DamageResult {
  const { attacker, defender, rng } = input;
  if (rng() < defender.evasion) return { evaded: true, amount: 0, crit: false };
  const crit = rng() < attacker.crit;
  const base = (input.damageType === 'physical' ? attacker.attack : attacker.power) * input.multiplier;
  const defense = input.damageType === 'physical' ? defender.defense : defender.defense / 2;
  const raw = base * (100 / (100 + defense)) * (crit ? CRIT_MULTIPLIER : 1) * input.damageTakenMultiplier;
  return { evaded: false, amount: Math.max(1, Math.round(raw)), crit };
}
