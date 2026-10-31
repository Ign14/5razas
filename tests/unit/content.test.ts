import { describe, expect, it } from 'vitest';
import { parseCharacterConfig } from '../../src/core/data/characterConfig.ts';
import { DataValidationError } from '../../src/core/data/validate.ts';
import { generateStartingSector } from '../../src/core/world/mapGenerator.ts';
import { reachableCells } from '../../src/core/world/reachability.ts';
import { parseTileCatalog } from '../../src/core/world/tileCatalog.ts';
import { parseTiledMap } from '../../src/core/world/tiledLoader.ts';
import playerJson from '../../src/data/characters/provisional-player.json';
import mapJson from '../../src/data/maps/bosque-inicial.json';
import tilesJson from '../../src/data/tiles.json';

const catalog = parseTileCatalog(tilesJson);
const clone = <T>(v: T): T => structuredClone(v);

describe('catálogo de tiles', () => {
  it('carga el catálogo del MVP', () => {
    expect(catalog.get('water').walkable).toBe(false);
    expect(catalog.get('dirt-path').layer).toBe('paths');
  });

  it('rechaza ids duplicados y campos inválidos', () => {
    const bad = {
      tiles: [
        { id: 'a', name: 'A', layer: 'ground', walkable: true, shape: 'flat', color: '#000000', minimapColor: '#000000' },
        { id: 'a', name: 'B', layer: 'nope', walkable: 'si', shape: 'flat', color: 'red', minimapColor: '#000000' },
      ],
    };
    expect(() => parseTileCatalog(bad)).toThrow(DataValidationError);
    try {
      parseTileCatalog(bad);
    } catch (e) {
      const issues = (e as DataValidationError).issues.join('\n');
      expect(issues).toContain('duplicado');
      expect(issues).toContain('layer');
      expect(issues).toContain('walkable');
      expect(issues).toContain('color');
    }
  });
});

describe('mapa inicial (Tiled JSON)', () => {
  const map = parseTiledMap(mapJson, catalog, 'bosque-inicial.json');

  it('es un sector isométrico de 64 × 64 con tiles de 64 × 32', () => {
    expect(map.width).toBe(64);
    expect(map.height).toBe(64);
    expect(map.iso).toEqual({ tileWidth: 64, tileHeight: 32 });
    expect(map.id).toBe('bosque-inicial');
  });

  it('el punto de aparición es transitable y conecta la mayor parte del mapa', () => {
    const sx = Math.floor(map.spawn.x);
    const sy = Math.floor(map.spawn.y);
    expect(map.isBlocked(sx, sy)).toBe(false);
    let walkable = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (!map.isBlocked(x, y)) walkable++;
    expect(reachableCells(map, { x: sx, y: sy }) / walkable).toBeGreaterThan(0.9);
  });

  it('agua, árboles y bordes bloquean; los senderos no', () => {
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if (map.tileAt('ground', x, y) === 'water' || map.tileAt('objects', x, y) !== null) {
          expect(map.isBlocked(x, y)).toBe(true);
        }
        if (map.tileAt('paths', x, y) !== null) expect(map.isBlocked(x, y)).toBe(false);
      }
    }
    expect(map.isBlocked(-1, 0)).toBe(true);
    expect(map.isBlocked(64, 10)).toBe(true);
  });

  it('el archivo coincide con la salida del generador (reproducible)', () => {
    const regenerated = generateStartingSector({
      seed: 5,
      width: 64,
      height: 64,
      mapId: 'bosque-inicial',
      name: 'Bosque inicial',
      tileIds: [...catalog.tiles.keys()],
    });
    expect(JSON.parse(JSON.stringify(regenerated))).toEqual(mapJson);
  });

  it('rechaza capas con tamaño incorrecto', () => {
    const bad = clone(mapJson);
    const ground = bad.layers.find((l) => l.name === 'ground');
    ground?.data?.pop();
    expect(() => parseTiledMap(bad, catalog, 'bad.json')).toThrow(/se esperaban 4096 celdas/);
  });

  it('rechaza GIDs desconocidos y capas faltantes', () => {
    const bad = clone(mapJson);
    const paths = bad.layers.find((l) => l.name === 'paths');
    if (paths?.data) paths.data[0] = 999;
    bad.layers = bad.layers.filter((l) => l.name !== 'detail');
    expect(() => parseTiledMap(bad, catalog, 'bad.json')).toThrow(/GID 999[\s\S]*falta la capa de tiles "detail"/);
  });

  it('rechaza mapas sin punto de aparición o con aparición bloqueada', () => {
    const noSpawn = clone(mapJson);
    noSpawn.layers = noSpawn.layers.filter((l) => l.name !== 'markers');
    expect(() => parseTiledMap(noSpawn, catalog, 'bad.json')).toThrow(/spawn/);

    const blocked = clone(mapJson);
    const objects = blocked.layers.find((l) => l.name === 'objects');
    const treeGid = [...catalog.tiles.keys()].indexOf('tree') + 1;
    if (objects?.data) objects.data[32 * 64 + 32] = treeGid;
    expect(() => parseTiledMap(blocked, catalog, 'bad.json')).toThrow(/bloqueado/);
  });

  it('rechaza orientación no isométrica y tamaño de tile distinto', () => {
    const bad = { ...clone(mapJson), orientation: 'orthogonal', tilewidth: 32 };
    expect(() => parseTiledMap(bad, catalog, 'bad.json')).toThrow(/isometric[\s\S]*tilewidth/);
  });
});

describe('configuración del personaje', () => {
  it('carga el personaje provisional', () => {
    const cfg = parseCharacterConfig(playerJson, 'player');
    expect(cfg.professionId).toBe('guardian-del-bosque');
    expect(cfg.colliderHalfSize).toBeLessThan(0.5);
  });

  it('rechaza valores fuera de rango', () => {
    expect(() => parseCharacterConfig({ ...playerJson, colliderHalfSize: 2 }, 'p')).toThrow(/colliderHalfSize/);
  });
});
