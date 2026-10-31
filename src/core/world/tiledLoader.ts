import { ID_PATTERN, Issues, isRecord } from '../data/validate.ts';
import type { Vec2 } from '../math/vector.ts';
import { MAP_LAYERS, type MapLayerId, type TileCatalog } from './tileCatalog.ts';
import { WorldMap, type SpawnZone } from './worldMap.ts';

/**
 * Cargador de mapas en formato JSON de Tiled (https://doc.mapeditor.org/en/stable/reference/json-map-format/).
 *
 * Restricciones soportadas actualmente (documentadas en docs/ARCHITECTURE.md):
 * - orientation "isometric", mapas finitos, capas sin compresión (arreglo `data`).
 * - Tilesets embebidos; cada tile declara la propiedad string `tileId` que referencia el catálogo.
 * - Capas de tiles nombradas como las capas lógicas (ground, detail, paths, objects).
 * - Grupo de objetos "markers" con un objeto de tipo "spawn" y, opcionalmente, objetos "spawn-zone"
 *   con propiedades creatureId (string), count (int) y radius (float, en celdas).
 */

/** Bits de volteo que Tiled codifica en los GID. */
const GID_MASK = 0x0fffffff;

export interface ExpectedMapShape {
  readonly tileWidth: number;
  readonly tileHeight: number;
}

function property(props: unknown, name: string): unknown {
  if (!Array.isArray(props)) return undefined;
  for (const p of props) {
    if (isRecord(p) && p['name'] === name) return p['value'];
  }
  return undefined;
}

function stringProperty(props: unknown, name: string): string | undefined {
  const v = property(props, name);
  return typeof v === 'string' ? v : undefined;
}

export function parseTiledMap(
  raw: unknown,
  catalog: TileCatalog,
  source: string,
  expected: ExpectedMapShape = { tileWidth: 64, tileHeight: 32 },
): WorldMap {
  const issues = new Issues();
  const root = issues.record(raw, '$');
  if (!root) issues.throwIfAny(source);
  const map = root as Record<string, unknown>;

  if (map['orientation'] !== 'isometric') issues.add('$.orientation', 'solo se admiten mapas "isometric"');
  if (map['infinite'] === true) issues.add('$.infinite', 'los mapas infinitos aún no están soportados');
  const width = issues.number(map['width'], '$.width', { integer: true, min: 1, max: 1024 });
  const height = issues.number(map['height'], '$.height', { integer: true, min: 1, max: 1024 });
  const tileWidth = issues.number(map['tilewidth'], '$.tilewidth', { integer: true, min: 1 });
  const tileHeight = issues.number(map['tileheight'], '$.tileheight', { integer: true, min: 1 });
  if (tileWidth !== undefined && tileWidth !== expected.tileWidth)
    issues.add('$.tilewidth', `se esperaba ${expected.tileWidth}`);
  if (tileHeight !== undefined && tileHeight !== expected.tileHeight)
    issues.add('$.tileheight', `se esperaba ${expected.tileHeight}`);

  const id = issues.string(stringProperty(map['properties'], 'mapId'), '$.properties.mapId', { pattern: ID_PATTERN });
  const name = issues.string(stringProperty(map['properties'], 'name'), '$.properties.name');

  // GID → id de tile del catálogo.
  const gidToTile = new Map<number, string>();
  issues.array(map['tilesets'], '$.tilesets')?.forEach((ts, i) => {
    const p = `$.tilesets[${i}]`;
    const tileset = issues.record(ts, p);
    if (!tileset) return;
    if (typeof tileset['source'] === 'string') {
      issues.add(p, 'los tilesets externos no están soportados; embébelos en el mapa');
      return;
    }
    const firstGid = issues.number(tileset['firstgid'], `${p}.firstgid`, { integer: true, min: 1 });
    issues.array(tileset['tiles'], `${p}.tiles`)?.forEach((t, j) => {
      const tp = `${p}.tiles[${j}]`;
      const tile = issues.record(t, tp);
      if (!tile || firstGid === undefined) return;
      const localId = issues.number(tile['id'], `${tp}.id`, { integer: true, min: 0 });
      const tileId = issues.string(stringProperty(tile['properties'], 'tileId'), `${tp}.properties.tileId`);
      if (localId === undefined || tileId === undefined) return;
      if (!catalog.tiles.has(tileId)) issues.add(`${tp}.properties.tileId`, `"${tileId}" no existe en el catálogo`);
      else gidToTile.set(firstGid + localId, tileId);
    });
  });

  const layers: Partial<Record<MapLayerId, (string | null)[]>> = {};
  let spawn: Vec2 | undefined;
  const spawnZones: SpawnZone[] = [];

  issues.array(map['layers'], '$.layers')?.forEach((l, i) => {
    const p = `$.layers[${i}]`;
    const layer = issues.record(l, p);
    if (!layer) return;
    const layerName = layer['name'];

    if (layer['type'] === 'tilelayer') {
      const layerId = issues.oneOf(layerName, MAP_LAYERS, `${p}.name`);
      if (!layerId || width === undefined || height === undefined) return;
      if (layers[layerId]) issues.add(`${p}.name`, `capa "${layerId}" duplicada`);
      if (layer['compression'] !== undefined || layer['encoding'] === 'base64') {
        issues.add(p, 'solo se admiten capas en formato CSV (arreglo de enteros)');
        return;
      }
      const data = issues.array(layer['data'], `${p}.data`);
      if (!data) return;
      if (data.length !== width * height) {
        issues.add(`${p}.data`, `se esperaban ${width * height} celdas, hay ${data.length}`);
        return;
      }
      layers[layerId] = data.map((gidRaw, index) => {
        if (typeof gidRaw !== 'number' || !Number.isInteger(gidRaw) || gidRaw < 0) {
          issues.add(`${p}.data[${index}]`, 'GID inválido');
          return null;
        }
        const gid = gidRaw & GID_MASK;
        if (gid === 0) return null;
        const tileId = gidToTile.get(gid);
        if (!tileId) {
          issues.add(`${p}.data[${index}]`, `GID ${gid} sin tile asociado`);
          return null;
        }
        const def = catalog.get(tileId);
        if (def.layer !== layerId)
          issues.add(`${p}.data[${index}]`, `el tile "${tileId}" pertenece a la capa "${def.layer}"`);
        return tileId;
      });
    } else if (layer['type'] === 'objectgroup' && layerName === 'markers') {
      issues.array(layer['objects'], `${p}.objects`)?.forEach((o, j) => {
        const op = `${p}.objects[${j}]`;
        const obj = issues.record(o, op);
        if (!obj) return;
        // Tiled ≥1.9 usa "class" en algunas versiones y "type" en otras.
        const kind = obj['type'] ?? obj['class'];
        if ((kind !== 'spawn' && kind !== 'spawn-zone') || tileHeight === undefined) return;
        const ox = issues.number(obj['x'], `${op}.x`);
        const oy = issues.number(obj['y'], `${op}.y`);
        if (ox === undefined || oy === undefined) return;
        // En mapas isométricos Tiled expresa ambas coordenadas en unidades de tileheight.
        const position = { x: ox / tileHeight, y: oy / tileHeight };
        if (kind === 'spawn') {
          spawn = position;
          return;
        }
        const props = obj['properties'];
        const zone = {
          id: issues.string(obj['name'], `${op}.name`, { pattern: ID_PATTERN }),
          creatureId: issues.string(property(props, 'creatureId'), `${op}.properties.creatureId`, { pattern: ID_PATTERN }),
          count: issues.number(property(props, 'count'), `${op}.properties.count`, { integer: true, min: 1, max: 50 }),
          radius: issues.number(property(props, 'radius'), `${op}.properties.radius`, { min: 0.5, max: 32 }),
        };
        if (zone.id && spawnZones.some((z) => z.id === zone.id)) issues.add(`${op}.name`, `zona duplicada "${zone.id}"`);
        if (zone.id && zone.creatureId && zone.count !== undefined && zone.radius !== undefined) {
          spawnZones.push({ id: zone.id, creatureId: zone.creatureId, count: zone.count, radius: zone.radius, center: position });
        }
      });
    }
  });

  for (const layerId of MAP_LAYERS) {
    if (!layers[layerId]) issues.add('$.layers', `falta la capa de tiles "${layerId}"`);
  }
  if (layers.ground?.some((t) => t === null)) issues.add('$.layers.ground', 'todas las celdas deben tener terreno');
  if (!spawn) issues.add('$.layers.markers', 'falta el objeto "spawn"');

  issues.throwIfAny(source);

  const result = new WorldMap({
    id: id as string,
    name: name as string,
    width: width as number,
    height: height as number,
    iso: { tileWidth: tileWidth as number, tileHeight: tileHeight as number },
    layers: layers as Record<MapLayerId, (string | null)[]>,
    spawn: spawn as Vec2,
    spawnZones,
    catalog,
  });
  const s = spawn as Vec2;
  if (result.isBlocked(Math.floor(s.x), Math.floor(s.y))) {
    throw new Error(`Mapa "${source}": el punto de aparición (${s.x}, ${s.y}) está bloqueado`);
  }
  return result;
}
