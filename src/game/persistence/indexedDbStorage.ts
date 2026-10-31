import type { SaveData, SaveStorage } from '../../core/persistence/saveGame.ts';

const DB_NAME = '5razas';
const DB_VERSION = 1;
const STORE = 'saves';

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => { resolve(r.result); };
    r.onerror = () => { reject(r.error ?? new Error('Error de IndexedDB')); };
  });
}

/**
 * Guardado local en IndexedDB (GAME_DESIGN §13), sin servicios externos.
 * Se usa la API nativa para no añadir dependencias (ver docs/DECISIONS.md).
 */
export class IndexedDbSaveStorage implements SaveStorage {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = () => { resolve(r.result); };
      r.onerror = () => { reject(r.error ?? new Error('No se pudo abrir IndexedDB')); };
    });
    return this.db;
  }

  async load(slot: string): Promise<unknown> {
    const db = await this.open();
    const value: unknown = await request<unknown>(db.transaction(STORE, 'readonly').objectStore(STORE).get(slot));
    return value ?? null;
  }

  async save(slot: string, data: SaveData): Promise<void> {
    const db = await this.open();
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, slot));
  }

  async remove(slot: string): Promise<void> {
    const db = await this.open();
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(slot));
  }
}

/** Ranura única del vertical slice. */
export const SAVE_SLOT = 'slot1';
