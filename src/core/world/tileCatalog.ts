import { HEX_COLOR_PATTERN, ID_PATTERN, Issues } from '../data/validate.ts';

/** Capas lógicas de un sector (subconjunto inicial de GAME_DESIGN §3.2). */
export const MAP_LAYERS = ['ground', 'detail', 'paths', 'objects'] as const;
export type MapLayerId = (typeof MAP_LAYERS)[number];

/** Forma visual provisional con la que se genera la textura placeholder. */
export const TILE_SHAPES = ['flat', 'water', 'tree', 'rock'] as const;
export type TileShape = (typeof TILE_SHAPES)[number];

export interface TileDefinition {
  readonly id: string;
  readonly name: string;
  /** Capa en la que puede colocarse. */
  readonly layer: MapLayerId;
  readonly walkable: boolean;
  readonly shape: TileShape;
  /** Color base del placeholder (#rrggbb). */
  readonly color: string;
  /** Color en el minimapa (#rrggbb). */
  readonly minimapColor: string;
}

export interface TileCatalog {
  readonly tiles: ReadonlyMap<string, TileDefinition>;
  get(id: string): TileDefinition;
}

export function parseTileCatalog(raw: unknown, source = 'tiles.json'): TileCatalog {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  const list = root ? issues.array(root['tiles'], '$.tiles') : undefined;
  const tiles = new Map<string, TileDefinition>();

  list?.forEach((entry, i) => {
    const p = `$.tiles[${i}]`;
    const t = issues.record(entry, p);
    if (!t) return;
    const def = {
      id: issues.string(t['id'], `${p}.id`, { pattern: ID_PATTERN }),
      name: issues.string(t['name'], `${p}.name`),
      layer: issues.oneOf(t['layer'], MAP_LAYERS, `${p}.layer`),
      walkable: issues.boolean(t['walkable'], `${p}.walkable`),
      shape: issues.oneOf(t['shape'], TILE_SHAPES, `${p}.shape`),
      color: issues.string(t['color'], `${p}.color`, { pattern: HEX_COLOR_PATTERN }),
      minimapColor: issues.string(t['minimapColor'], `${p}.minimapColor`, { pattern: HEX_COLOR_PATTERN }),
    };
    if (def.id && tiles.has(def.id)) issues.add(`${p}.id`, `identificador duplicado "${def.id}"`);
    if (
      def.id !== undefined &&
      def.name !== undefined &&
      def.layer !== undefined &&
      def.walkable !== undefined &&
      def.shape !== undefined &&
      def.color !== undefined &&
      def.minimapColor !== undefined
    ) {
      tiles.set(def.id, def as TileDefinition);
    }
  });

  if (list?.length === 0) issues.add('$.tiles', 'el catálogo está vacío');
  issues.throwIfAny(source);

  return {
    tiles,
    get(id: string): TileDefinition {
      const def = tiles.get(id);
      if (!def) throw new Error(`Tile desconocido: "${id}"`);
      return def;
    },
  };
}
