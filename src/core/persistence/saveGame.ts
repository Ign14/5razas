import { EQUIP_SLOTS, type EquipSlot } from '../items/itemCatalog.ts';
import type { ItemStack } from '../items/inventory.ts';
import type { QuestLogJSON } from '../quests/quests.ts';
import { Issues, isRecord } from '../data/validate.ts';

/** Versión del esquema de guardado (GAME_DESIGN §13: los guardados cuentan con versión de esquema). */
export const SAVE_SCHEMA_VERSION = 1;

/** Contenido guardado de una partida (GAME_DESIGN §15). */
export interface SavePayload {
  readonly character: { readonly id: string; readonly name: string; readonly professionId: string; readonly people: string | null };
  readonly xp: number;
  readonly player: { readonly x: number; readonly y: number; readonly hp: number; readonly energy: number };
  readonly inventory: readonly (ItemStack | null)[];
  readonly equipment: Partial<Record<EquipSlot, string>>;
  readonly quickSlots: readonly (string | null)[];
  readonly discoveries: readonly string[];
  readonly quests: QuestLogJSON;
  readonly worldTime: number;
  readonly mapId: string;
  /** Celdas exploradas codificadas por tramos (RLE) sobre "0"/"1". */
  readonly exploration: string;
  readonly bossesDefeated: readonly string[];
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface SaveData {
  readonly schemaVersion: number;
  readonly savedAt: string;
  /** Suma de verificación del contenido para detectar archivos dañados o editados. */
  readonly checksum: string;
  readonly payload: SavePayload;
}

/** FNV-1a de 32 bits sobre el JSON del contenido. */
export function checksumOf(payload: unknown): string {
  const text = JSON.stringify(payload);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function createSave(payload: SavePayload, now: Date): SaveData {
  return { schemaVersion: SAVE_SCHEMA_VERSION, savedAt: now.toISOString(), checksum: checksumOf(payload), payload };
}

/** Codifica un arreglo de 0/1 como tramos "valor:longitud" separados por comas. */
export function encodeBits(bits: readonly number[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < bits.length) {
    const v = bits[i] ? 1 : 0;
    let n = 0;
    while (i < bits.length && (bits[i] ? 1 : 0) === v) {
      i++;
      n++;
    }
    out.push(`${v}:${n}`);
  }
  return out.join(',');
}

export function decodeBits(encoded: string, length: number): number[] {
  const bits: number[] = [];
  if (encoded.length > 0) {
    for (const run of encoded.split(',')) {
      const [v, n] = run.split(':').map(Number);
      if ((v !== 0 && v !== 1) || n === undefined || !Number.isInteger(n) || n < 0) throw new Error(`Tramo inválido: "${run}"`);
      for (let k = 0; k < n; k++) bits.push(v);
    }
  }
  if (bits.length !== length) throw new Error(`Exploración con ${bits.length} celdas, se esperaban ${length}`);
  return bits;
}

/** Migración de una versión del esquema a la siguiente (función pura sobre el JSON). */
export type SaveMigration = (payload: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migraciones registradas: la entrada `n` convierte un guardado de la versión `n` a la `n + 1`.
 * Vacía en la versión 1; cada cambio de esquema futuro añade una entrada aquí y sube SAVE_SCHEMA_VERSION.
 */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {};

export type LoadResult = { readonly ok: true; readonly save: SaveData; readonly migrated: boolean } | { readonly ok: false; readonly issues: readonly string[] };

/**
 * Valida integridad y estructura, y migra a la versión actual.
 * No consulta el contenido del juego: las referencias (objetos, misiones) se comprueban al aplicarlo.
 */
export function loadSave(
  raw: unknown,
  migrations: Readonly<Record<number, SaveMigration>> = SAVE_MIGRATIONS,
  currentVersion = SAVE_SCHEMA_VERSION,
): LoadResult {
  if (!isRecord(raw)) return { ok: false, issues: ['el guardado no es un objeto'] };
  const version = raw['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return { ok: false, issues: ['versión de esquema ausente o inválida'] };
  if (version > currentVersion) return { ok: false, issues: [`guardado de una versión más nueva (${version})`] };
  if (!isRecord(raw['payload'])) return { ok: false, issues: ['falta el contenido del guardado'] };
  if (checksumOf(raw['payload']) !== raw['checksum']) return { ok: false, issues: ['la suma de verificación no coincide (archivo dañado)'] };

  let payload = raw['payload'];
  for (let v = version; v < currentVersion; v++) {
    const m = migrations[v];
    if (!m) return { ok: false, issues: [`no hay migración desde la versión ${v}`] };
    payload = m(payload);
  }
  const issues = validatePayload(payload);
  if (issues.length > 0) return { ok: false, issues };
  const save: SaveData = {
    schemaVersion: currentVersion,
    savedAt: typeof raw['savedAt'] === 'string' ? raw['savedAt'] : new Date(0).toISOString(),
    checksum: checksumOf(payload),
    payload: payload as unknown as SavePayload,
  };
  return { ok: true, save, migrated: version !== currentVersion };
}

function validatePayload(p: Record<string, unknown>): string[] {
  const issues = new Issues();
  const ch = issues.record(p['character'], '$.character');
  if (ch) {
    issues.string(ch['id'], '$.character.id');
    issues.string(ch['name'], '$.character.name');
    issues.string(ch['professionId'], '$.character.professionId');
  }
  issues.number(p['xp'], '$.xp', { min: 0 });
  const pl = issues.record(p['player'], '$.player');
  if (pl) for (const k of ['x', 'y', 'hp', 'energy']) issues.number(pl[k], `$.player.${k}`, { min: 0 });
  issues.array(p['inventory'], '$.inventory')?.forEach((s, i) => {
    if (s === null) return;
    const r = issues.record(s, `$.inventory[${i}]`);
    if (!r) return;
    issues.string(r['itemId'], `$.inventory[${i}].itemId`);
    issues.number(r['quantity'], `$.inventory[${i}].quantity`, { integer: true, min: 1 });
  });
  const eq = issues.record(p['equipment'], '$.equipment');
  if (eq) for (const k of Object.keys(eq)) if (!(EQUIP_SLOTS as readonly string[]).includes(k)) issues.add(`$.equipment.${k}`, 'ranura desconocida');
  issues.array(p['quickSlots'], '$.quickSlots');
  issues.array(p['discoveries'], '$.discoveries');
  issues.record(p['quests'], '$.quests');
  issues.number(p['worldTime'], '$.worldTime', { min: 0 });
  issues.string(p['mapId'], '$.mapId');
  if (typeof p['exploration'] !== 'string') issues.add('$.exploration', 'se esperaba un texto');
  issues.array(p['bossesDefeated'], '$.bossesDefeated');
  issues.record(p['settings'], '$.settings');
  return [...issues.messages()];
}

/** Almacenamiento de partidas (IndexedDB en el navegador, memoria en pruebas). */
export interface SaveStorage {
  load(slot: string): Promise<unknown>;
  save(slot: string, data: SaveData): Promise<void>;
  remove(slot: string): Promise<void>;
}

export class MemorySaveStorage implements SaveStorage {
  private readonly slots = new Map<string, string>();

  load(slot: string): Promise<unknown> {
    const s = this.slots.get(slot);
    return Promise.resolve(s === undefined ? null : (JSON.parse(s) as unknown));
  }

  save(slot: string, data: SaveData): Promise<void> {
    this.slots.set(slot, JSON.stringify(data));
    return Promise.resolve();
  }

  remove(slot: string): Promise<void> {
    this.slots.delete(slot);
    return Promise.resolve();
  }
}
