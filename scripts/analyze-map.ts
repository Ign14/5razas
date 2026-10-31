/**
 * Diagnóstico del mapa: conectividad y vista ASCII (submuestreada en filas).
 * Uso: npm run analyze:map
 */
import { readFileSync } from 'node:fs';
import { reachableCells } from '../src/core/world/reachability.ts';
import { parseTileCatalog } from '../src/core/world/tileCatalog.ts';
import { parseTiledMap } from '../src/core/world/tiledLoader.ts';

const catalog = parseTileCatalog(JSON.parse(readFileSync('src/data/tiles.json', 'utf8')));
const map = parseTiledMap(JSON.parse(readFileSync('src/data/maps/bosque-inicial.json', 'utf8')), catalog, 'map');

let walkable = 0;
for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (!map.isBlocked(x, y)) walkable++;
const reach = reachableCells(map, { x: Math.floor(map.spawn.x), y: Math.floor(map.spawn.y) });
console.log(
  `spawn=(${map.spawn.x}, ${map.spawn.y}) transitables=${walkable} alcanzables=${reach} (${((reach / walkable) * 100).toFixed(1)}%)`,
);

const glyph: Record<string, string> = {
  tree: 'T',
  rock: 'o',
  water: '~',
  'dirt-path': '=',
  sand: '.',
  'stone-floor': ':',
  'grass-dark': ',',
  grass: ' ',
};
for (let y = 0; y < map.height; y += 2) {
  let row = '';
  for (let x = 0; x < map.width; x++) row += glyph[map.surfaceTile(x, y) ?? 'grass'] ?? '?';
  console.log(row);
}
