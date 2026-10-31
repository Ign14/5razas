import type { IsoMetrics } from '../math/iso.ts';
import type { Vec2 } from '../math/vector.ts';
import type { CollisionMap } from './collision.ts';
import type { MapLayerId, TileCatalog } from './tileCatalog.ts';

/** Contenido de una capa: id de tile por celda o null si está vacía. Fila mayor. */
export type LayerCells = readonly (string | null)[];

/** Zona de aparición de criaturas, definida en el mapa (objeto Tiled de tipo "spawn-zone"). */
export interface SpawnZone {
  readonly id: string;
  readonly creatureId: string;
  readonly center: Vec2;
  readonly radius: number;
  readonly count: number;
}

/** Zona de recolección de una planta (objeto Tiled de tipo "gather-zone", GAME_DESIGN §3.3). */
export interface GatherZone {
  readonly id: string;
  readonly plantId: string;
  readonly center: Vec2;
  readonly radius: number;
  readonly count: number;
}

/** Sector del mundo ya validado, independiente del formato de origen y de Phaser. */
export class WorldMap implements CollisionMap {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly iso: IsoMetrics;
  readonly layers: Readonly<Record<MapLayerId, LayerCells>>;
  readonly spawn: Vec2;
  readonly spawnZones: readonly SpawnZone[];
  readonly gatherZones: readonly GatherZone[];
  readonly catalog: TileCatalog;
  private readonly blocked: Uint8Array;

  constructor(init: {
    id: string;
    name: string;
    width: number;
    height: number;
    iso: IsoMetrics;
    layers: Readonly<Record<MapLayerId, LayerCells>>;
    spawn: Vec2;
    spawnZones?: readonly SpawnZone[];
    gatherZones?: readonly GatherZone[];
    catalog: TileCatalog;
  }) {
    const { width, height, layers, catalog } = init;
    this.id = init.id;
    this.name = init.name;
    this.width = width;
    this.height = height;
    this.iso = init.iso;
    this.layers = layers;
    this.spawn = init.spawn;
    this.spawnZones = init.spawnZones ?? [];
    this.gatherZones = init.gatherZones ?? [];
    this.catalog = catalog;
    this.blocked = new Uint8Array(width * height);
    for (const layer of Object.values(layers)) {
      layer.forEach((tileId, index) => {
        if (tileId !== null && !catalog.get(tileId).walkable) this.blocked[index] = 1;
      });
    }
  }

  inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(layer: MapLayerId, x: number, y: number): string | null {
    if (!this.inBounds(x, y)) return null;
    return this.layers[layer][y * this.width + x] ?? null;
  }

  /** Las celdas fuera del mapa se consideran bloqueadas. */
  isBlocked(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.blocked[y * this.width + x] === 1;
  }

  /** Tile visible más alto entre las capas planas (para minimapa). */
  surfaceTile(x: number, y: number): string | null {
    return this.tileAt('objects', x, y) ?? this.tileAt('paths', x, y) ?? this.tileAt('detail', x, y) ?? this.tileAt('ground', x, y);
  }
}
