import { fractalNoise, hash2 } from '../math/random.ts';
import type { MapLayerId } from './tileCatalog.ts';

/**
 * Generador determinista del sector inicial en formato JSON de Tiled.
 *
 * Es una herramienta de autoría: produce un archivo .json que luego puede editarse en Tiled.
 * El juego nunca genera mapas en tiempo de ejecución; siempre carga el JSON validado.
 */
export interface GeneratorOptions {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly mapId: string;
  readonly name: string;
  /** Ids del catálogo en el orden en que se asignarán los ids locales del tileset. */
  readonly tileIds: readonly string[];
}

/** Ids de tile que usa el generador; deben existir en el catálogo. */
export const GENERATOR_TILES = {
  grass: 'grass',
  grassDark: 'grass-dark',
  sand: 'sand',
  water: 'water',
  stone: 'stone-floor',
  path: 'dirt-path',
  tree: 'tree',
  rock: 'rock',
} as const;

/**
 * Zonas de aparición del sector inicial (en celdas). Deben quedar fuera del alcance de detección
 * (aggro + deambulación) desde el punto de aparición del jugador; lo verifica una prueba.
 */
export const STARTING_SPAWN_ZONES = [
  { id: 'brotes-cantera', creatureId: 'thorn-sprout', x: 14.5, y: 47.5, radius: 4, count: 3 },
  { id: 'brotes-sendero-sur', creatureId: 'thorn-sprout', x: 34.5, y: 54.5, radius: 3, count: 2 },
  { id: 'brotes-este', creatureId: 'thorn-sprout', x: 54.5, y: 36.5, radius: 3, count: 2 },
  { id: 'polillas-lago', creatureId: 'ash-moth', x: 41.5, y: 14.5, radius: 3, count: 3 },
  { id: 'polillas-noroeste', creatureId: 'ash-moth', x: 12.5, y: 14.5, radius: 4, count: 2 },
  // Fauna (Fase 4).
  { id: 'conejos-pradera-norte', creatureId: 'conejo-cola-algodon', x: 26.5, y: 6.5, radius: 4, count: 3 },
  { id: 'conejos-suroeste', creatureId: 'conejo-cola-algodon', x: 5.5, y: 40.5, radius: 3, count: 2 },
  { id: 'ciervos-oeste', creatureId: 'ciervo-cola-blanca', x: 7.5, y: 26.5, radius: 3, count: 2 },
  { id: 'pavos-este', creatureId: 'pavo-silvestre', x: 56.5, y: 46.5, radius: 4, count: 3 },
  { id: 'pecaries-sureste', creatureId: 'pecari-de-collar', x: 45.5, y: 57.5, radius: 2.5, count: 2 },
] as const;

/** Zonas de recolección de plantas (Fase 4). */
export const STARTING_GATHER_ZONES = [
  { id: 'hoja-carmesi-sendero', plantId: 'hoja-carmesi', x: 22.5, y: 36.5, radius: 4, count: 4 },
  { id: 'raiz-solar-cantera', plantId: 'raiz-solar', x: 14.5, y: 46.5, radius: 5, count: 3 },
  { id: 'flor-escarcha-orilla', plantId: 'flor-de-escarcha', x: 42.5, y: 24.5, radius: 3, count: 3 },
  { id: 'hongo-azul-bosque', plantId: 'hongo-azul', x: 20.5, y: 18.5, radius: 4, count: 3 },
  { id: 'espora-umbria-sur', plantId: 'espora-umbria', x: 44.5, y: 56.5, radius: 4, count: 3 },
  { id: 'savia-gris-claro', plantId: 'savia-gris', x: 26.5, y: 27.5, radius: 3, count: 3 },
  { id: 'semilla-viento-norte', plantId: 'semilla-del-viento', x: 30.5, y: 5.5, radius: 5, count: 3 },
  { id: 'hoja-ligera-norte', plantId: 'hoja-ligera', x: 40.5, y: 6.5, radius: 4, count: 3 },
  { id: 'raiz-vital-oeste', plantId: 'raiz-vital', x: 4.5, y: 17.5, radius: 3, count: 3 },
  { id: 'flor-dorada-este', plantId: 'flor-dorada', x: 54.5, y: 30.5, radius: 3, count: 2 },
] as const;

export interface TiledMapJson {
  readonly [key: string]: unknown;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly { readonly [key: string]: unknown; name: string; type: string }[];
}

export function generateStartingSector(opts: GeneratorOptions): TiledMapJson {
  const { seed, width: W, height: H } = opts;
  const T = GENERATOR_TILES;
  for (const id of Object.values(T)) {
    if (!opts.tileIds.includes(id)) throw new Error(`El catálogo no contiene "${id}"`);
  }
  const gid = (tileId: string) => opts.tileIds.indexOf(tileId) + 1;

  const grid: Record<MapLayerId, (string | null)[]> = {
    ground: new Array<string | null>(W * H).fill(T.grass),
    detail: new Array<string | null>(W * H).fill(null),
    paths: new Array<string | null>(W * H).fill(null),
    objects: new Array<string | null>(W * H).fill(null),
  };
  const idx = (x: number, y: number) => y * W + x;
  const spawn = { x: Math.floor(W / 2), y: Math.floor(H / 2) };

  // 1. Lago con orilla de arena (forma elíptica deformada por ruido).
  const lake = { x: W * 0.7, y: H * 0.28, rx: W * 0.14, ry: H * 0.1 };
  // 2. Zona rocosa transitable.
  const quarry = { x: W * 0.22, y: H * 0.74, r: W * 0.09 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fractalNoise(x / 8, y / 8, seed) - 0.5;
      const d = ((x - lake.x) / lake.rx) ** 2 + ((y - lake.y) / lake.ry) ** 2 + n * 0.7;
      if (d < 1) grid.ground[idx(x, y)] = T.water;
      else if (d < 1.45) grid.ground[idx(x, y)] = T.sand;
      else if (Math.hypot(x - quarry.x, y - quarry.y) + n * 6 < quarry.r) grid.ground[idx(x, y)] = T.stone;
      else if (fractalNoise(x / 5, y / 5, seed + 7) > 0.58) grid.detail[idx(x, y)] = T.grassDark;
    }
  }

  // 3. Senderos: uno este-oeste y otro norte-sur que se cruzan en el punto de aparición.
  const paint = (x: number, y: number) => {
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
    if (grid.ground[idx(x, y)] === T.water) return;
    grid.paths[idx(x, y)] = T.path;
    grid.detail[idx(x, y)] = null;
  };
  for (let x = 1; x < W - 1; x++) {
    const y = spawn.y + Math.round(Math.sin((x - spawn.x) / 7) * 3);
    paint(x, y);
    paint(x, y + 1);
  }
  for (let y = spawn.y; y < H - 1; y++) {
    const x = spawn.x + Math.round(Math.sin((y - spawn.y) / 6) * 2);
    paint(x, y);
    paint(x + 1, y);
  }
  // Ramal hacia la orilla del lago.
  for (let y = spawn.y; y > lake.y; y--) {
    const x = spawn.x + Math.round((spawn.y - y) * 0.45);
    if (grid.ground[idx(x, y)] === T.water) break;
    paint(x, y);
    paint(x + 1, y);
  }

  // 4. Árboles (bosque por ruido + anillo en el borde) y rocas dispersas.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      const ground = grid.ground[i];
      if (grid.paths[i] !== null || ground === T.water || ground === T.sand) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 4) continue;
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      const forest = fractalNoise(x / 9, y / 9, seed + 31);
      const r = hash2(x, y, seed + 99);
      if (edge === 0 || (edge < 3 && r < 0.6) || (forest > 0.6 && r < 0.55)) grid.objects[i] = T.tree;
      else if (r > 0.985) grid.objects[i] = T.rock;
    }
  }

  const tileLayer = (name: MapLayerId, id: number) => ({
    id,
    name,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: W,
    height: H,
    opacity: 1,
    visible: true,
    data: grid[name].map((t) => (t === null ? 0 : gid(t))),
  });

  return {
    compressionlevel: -1,
    height: H,
    width: W,
    infinite: false,
    orientation: 'isometric',
    renderorder: 'right-down',
    tiledversion: '1.11.2',
    version: '1.10',
    type: 'map',
    tileheight: 32,
    tilewidth: 64,
    nextlayerid: 6,
    nextobjectid: 2 + STARTING_SPAWN_ZONES.length + STARTING_GATHER_ZONES.length,
    properties: [
      { name: 'mapId', type: 'string', value: opts.mapId },
      { name: 'name', type: 'string', value: opts.name },
      { name: 'generatorSeed', type: 'int', value: seed },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'placeholder-tiles',
        tilewidth: 64,
        tileheight: 96,
        tilecount: opts.tileIds.length,
        columns: 0,
        margin: 0,
        spacing: 0,
        grid: { orientation: 'isometric', width: 64, height: 32 },
        tiles: opts.tileIds.map((tileId, i) => ({
          id: i,
          image: `../../../public/placeholder/${tileId}.png`,
          imagewidth: 64,
          imageheight: 96,
          properties: [{ name: 'tileId', type: 'string', value: tileId }],
        })),
      },
    ],
    layers: [
      tileLayer('ground', 1),
      tileLayer('detail', 2),
      tileLayer('paths', 3),
      tileLayer('objects', 4),
      {
        id: 5,
        name: 'markers',
        type: 'objectgroup',
        draworder: 'topdown',
        opacity: 1,
        visible: true,
        x: 0,
        y: 0,
        objects: [
          {
            id: 1,
            name: 'player-spawn',
            type: 'spawn',
            point: true,
            rotation: 0,
            visible: true,
            width: 0,
            height: 0,
            x: (spawn.x + 0.5) * 32,
            y: (spawn.y + 0.5) * 32,
          },
          ...STARTING_SPAWN_ZONES.map((z, i) => ({
            id: 2 + i,
            name: z.id,
            type: 'spawn-zone',
            point: true,
            rotation: 0,
            visible: true,
            width: 0,
            height: 0,
            x: z.x * 32,
            y: z.y * 32,
            properties: [
              { name: 'count', type: 'int', value: z.count },
              { name: 'creatureId', type: 'string', value: z.creatureId },
              { name: 'radius', type: 'float', value: z.radius },
            ],
          })),
          ...STARTING_GATHER_ZONES.map((z, i) => ({
            id: 2 + STARTING_SPAWN_ZONES.length + i,
            name: z.id,
            type: 'gather-zone',
            point: true,
            rotation: 0,
            visible: true,
            width: 0,
            height: 0,
            x: z.x * 32,
            y: z.y * 32,
            properties: [
              { name: 'count', type: 'int', value: z.count },
              { name: 'plantId', type: 'string', value: z.plantId },
              { name: 'radius', type: 'float', value: z.radius },
            ],
          })),
        ],
      },
    ],
  };
}
