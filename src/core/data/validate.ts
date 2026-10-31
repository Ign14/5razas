/**
 * Validación mínima de datos cargados desde JSON.
 * Se evita una dependencia externa en la Fase 0; si los contratos crecen se evaluará
 * migrar a valibot (ver docs/DECISIONS.md, D-005).
 */
export class DataValidationError extends Error {
  readonly source: string;
  readonly issues: readonly string[];

  constructor(source: string, issues: readonly string[]) {
    super(`Datos inválidos en "${source}":\n - ${issues.join('\n - ')}`);
    this.name = 'DataValidationError';
    this.source = source;
    this.issues = issues;
  }
}

export type Json = Record<string, unknown>;

export function isRecord(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Acumula errores con su ruta para reportarlos todos juntos. */
export class Issues {
  private readonly list: string[] = [];

  add(path: string, message: string): void {
    this.list.push(`${path}: ${message}`);
  }

  get count(): number {
    return this.list.length;
  }

  /** Problemas acumulados, sin lanzar excepción. */
  messages(): readonly string[] {
    return this.list;
  }

  throwIfAny(source: string): void {
    if (this.list.length > 0) throw new DataValidationError(source, this.list);
  }

  record(v: unknown, path: string): Json | undefined {
    if (isRecord(v)) return v;
    this.add(path, 'se esperaba un objeto');
    return undefined;
  }

  array(v: unknown, path: string): unknown[] | undefined {
    if (Array.isArray(v)) return v as unknown[];
    this.add(path, 'se esperaba un arreglo');
    return undefined;
  }

  string(v: unknown, path: string, opts: { pattern?: RegExp } = {}): string | undefined {
    if (typeof v !== 'string' || v.length === 0) {
      this.add(path, 'se esperaba un texto no vacío');
      return undefined;
    }
    if (opts.pattern && !opts.pattern.test(v)) {
      this.add(path, `"${v}" no cumple el formato ${String(opts.pattern)}`);
      return undefined;
    }
    return v;
  }

  number(v: unknown, path: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number | undefined {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      this.add(path, 'se esperaba un número finito');
      return undefined;
    }
    if (opts.integer === true && !Number.isInteger(v)) {
      this.add(path, `se esperaba un entero, se recibió ${v}`);
      return undefined;
    }
    if (opts.min !== undefined && v < opts.min) {
      this.add(path, `debe ser ≥ ${opts.min}, se recibió ${v}`);
      return undefined;
    }
    if (opts.max !== undefined && v > opts.max) {
      this.add(path, `debe ser ≤ ${opts.max}, se recibió ${v}`);
      return undefined;
    }
    return v;
  }

  boolean(v: unknown, path: string): boolean | undefined {
    if (typeof v === 'boolean') return v;
    this.add(path, 'se esperaba un booleano');
    return undefined;
  }

  oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T | undefined {
    if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T;
    this.add(path, `debe ser uno de [${options.join(', ')}]`);
    return undefined;
  }
}

/** Identificadores estables: minúsculas, dígitos y guiones. */
export const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
