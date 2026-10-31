/**
 * Genera el sector inicial en formato Tiled JSON.
 * Uso: npm run gen:map
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateStartingSector } from '../src/core/world/mapGenerator.ts';
import { parseTileCatalog } from '../src/core/world/tileCatalog.ts';
import { parseTiledMap } from '../src/core/world/tiledLoader.ts';

const root = new URL('../', import.meta.url);
const catalog = parseTileCatalog(JSON.parse(readFileSync(new URL('src/data/tiles.json', root), 'utf8')));

const map = generateStartingSector({
  seed: 5,
  width: 64,
  height: 64,
  mapId: 'bosque-inicial',
  name: 'Bosque inicial',
  tileIds: [...catalog.tiles.keys()],
});

// Validar con el mismo cargador que usa el juego antes de escribir.
parseTiledMap(map, catalog, 'bosque-inicial (generado)');

const out = fileURLToPath(new URL('src/data/maps/bosque-inicial.json', root));
writeFileSync(out, JSON.stringify(map) + '\n');
console.log(`Mapa escrito en ${out}`);
