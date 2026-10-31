import { Issues } from '../data/validate.ts';

/** Configuración del ciclo de día y noche (condiciones de aparición, GAME_DESIGN §8 y §10.1). */
export interface ClockConfig {
  /** Segundos reales que dura un día completo de juego. */
  readonly dayLengthSeconds: number;
  /** Hora del día (0–24) al comenzar la partida. */
  readonly startHour: number;
}

/** Rango horario [desde, hasta) en horas 0–24; puede cruzar la medianoche (p. ej. [19, 6]). */
export type HourRange = readonly [number, number];

export function parseClockConfig(raw: unknown, source: string): ClockConfig {
  const issues = new Issues();
  const r = issues.record(raw, '$') ?? {};
  const cfg = {
    dayLengthSeconds: issues.number(r['dayLengthSeconds'], '$.dayLengthSeconds', { min: 10, max: 86_400 }),
    startHour: issues.number(r['startHour'], '$.startHour', { min: 0, max: 23.99 }),
  };
  issues.throwIfAny(source);
  return cfg as ClockConfig;
}

export function parseHourRange(issues: Issues, raw: unknown, path: string): HourRange | null {
  if (raw === undefined || raw === null) return null;
  const a = issues.array(raw, path);
  const from = issues.number(a?.[0], `${path}[0]`, { min: 0, max: 24 });
  const to = issues.number(a?.[1], `${path}[1]`, { min: 0, max: 24 });
  if (from === undefined || to === undefined) return null;
  if (from === to) issues.add(path, 'el rango horario no puede estar vacío');
  return [from, to];
}

/** Hora del día (0–24) para un tiempo de simulación. */
export function hourAt(cfg: ClockConfig, time: number): number {
  return (((cfg.startHour + (time / cfg.dayLengthSeconds) * 24) % 24) + 24) % 24;
}

/** Día de juego (empieza en 1). */
export function dayAt(cfg: ClockConfig, time: number): number {
  return 1 + Math.floor((cfg.startHour + (time / cfg.dayLengthSeconds) * 24) / 24);
}

export function inHourRange(hour: number, range: HourRange | null): boolean {
  if (range === null) return true;
  const [from, to] = range;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

/**
 * Oscuridad ambiental (0 = día pleno, 1 = noche cerrada), con transiciones al amanecer (5–7 h)
 * y al atardecer (18–20 h). Solo la usa la representación gráfica.
 */
export function darknessAt(hour: number): number {
  if (hour >= 7 && hour < 18) return 0;
  if (hour >= 20 || hour < 5) return 1;
  if (hour >= 5 && hour < 7) return 1 - (hour - 5) / 2;
  return (hour - 18) / 2;
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
