# Arquitectura — 5RAZAS

Estado: Fase 0 completa, Fase 1 en curso. Última actualización: 2026-10-30.

## Stack verificado

| Paquete | Versión | Nota |
|---|---|---|
| phaser | 3.90.0 (exacta) | `latest` en npm ya es 4.x; se fija 3.x por especificación |
| typescript | ~6.0.3 | typescript-eslint 8.72 exige `<6.1` |
| vite | ^8.3.5 | requiere Node ≥ 20.19 / 22.12 |
| vitest | ^5.0.5 | pruebas unitarias en Node (sin renderizador) |
| @playwright/test | ^1.64.1 | humo E2E en Chromium sobre el build de producción |
| eslint + typescript-eslint | ^10.14 / ^8.72 | `strictTypeChecked` |

Node usado en desarrollo: 22.14.0.

## Capas y regla de dependencias

```
src/
  core/        Reglas puras. PROHIBIDO importar phaser o src/game (regla ESLint).
    math/      Vectores, proyección isométrica, ruido/hash deterministas.
    world/     Catálogo de tiles, WorldMap, cargador Tiled, colisiones, exploración, generador.
    movement/  Entrada abstracta → intención, orientación (8 dir), stepMotion.
    data/      Validación de JSON y contratos de configuración.
  data/        Contenido JSON (tiles, mapas Tiled, personaje, controles).
  game/        Adaptadores Phaser.
    scenes/    Boot → Menu → Game (+ Hud en paralelo).
    rendering/ Texturas provisionales, profundidades, WorldRenderer.
    entities/  Vistas de entidades (PlayerView).
    input/     Teclado → MoveInput (asignaciones desde data/controls.json).
    ui/        Minimapa.
    session.ts Estado de partida compartido (sin Phaser).
    content.ts Carga y validación del contenido.
  config/      Configuración del motor Phaser.
```

Dirección de dependencias: `game → core`, `game → data`, `core → (nada externo)`.
Así el combate, la progresión y la alquimia futuros se podrán probar sin Phaser (GAME_DESIGN §13).

## Flujo de un frame

1. `KeyboardMoveInput.read()` → `MoveInput` (acciones, no teclas).
2. `intentFromInput` → vector de intención en pantalla (normalizado).
3. `stepMotion` (core): convierte a dirección en celdas, aplica velocidad (celdas/s, dt limitado a 0,1 s) y
   `moveWithCollisions` (AABB por ejes separados, subpasos de 0,25 celdas → sin efecto túnel, deslizamiento en paredes).
4. `GameSession.setPlayer` actualiza la niebla de exploración y notifica celdas reveladas.
5. `PlayerView.sync` proyecta a pantalla, ajusta profundidad y animación.
6. `HudScene` → `Minimap.update` repinta solo si hubo celdas nuevas y redibuja el marcador.

## Sistema de coordenadas

- Celdas lógicas: la celda (i, j) ocupa [i, i+1) × [j, j+1). Las entidades usan posiciones continuas.
- Pantalla: `x = (cx − cy)·32`, `y = (cx + cy)·16` (tiles 64 × 32, proyección 2:1). Inversa exacta en `screenToCell`.
- WASD se interpreta en pantalla (W = arriba del monitor) y se convierte a celdas; la velocidad es constante en
  el espacio lógico.

## Mapas

- Formato: JSON de Tiled, orientación `isometric`, tiles 64 × 32, capas en CSV, tileset **embebido**.
- Cada tile del tileset declara la propiedad `tileId` que referencia `data/tiles.json`.
- Capas de tiles obligatorias: `ground`, `detail`, `paths`, `objects`. Grupo de objetos `markers` con un objeto `spawn`.
- Coordenadas de objetos Tiled isométricos: ambas en unidades de `tileheight` → celda = valor / 32.
- `parseTiledMap` valida todo y reporta todos los errores juntos; el juego muestra el error en pantalla si el contenido es inválido.
- `bosque-inicial.json` se produce con `npm run gen:map` (generador determinista, semilla 5). Una prueba
  verifica que el archivo coincide con el generador. Si se edita a mano en Tiled, eliminar esa prueba o cambiar
  la fuente de verdad (decisión pendiente, ver TASKS).
- Colisión: una celda está bloqueada si algún tile de cualquier capa tiene `walkable: false`. Fuera del mapa = bloqueado.

## Renderizado

- Capas planas (`ground`, `detail`, `paths`): un `Blitter` por textura, profundidades 0/1/2.
- Objetos (`objects`) y entidades: banda ordenada por la Y de pantalla de su base (`sortedDepth`); las entidades
  reciben +0,5 de desempate.
- Texturas generadas por código con prefijo `ph-` (provisionales). Para reemplazarlas basta con cargar sprites con
  las mismas claves y dimensiones (64 × 96 por tile, origen en el centro del rombo).
- `pixelArt: true`, `roundPixels`, escala `RESIZE`.

## Gancho de depuración

`window.__5RAZAS__` (solo lectura): `player()`, `exploredCells()`, `mapId`. Lo usan las pruebas E2E.

## Limitaciones conocidas

- Sin culling por chunks: se crean ~1.000 Images de objetos; aceptable para 64 × 64, revisar al cargar sectores.
- El tileset del JSON referencia imágenes `public/placeholder/*.png` que aún no existen: el mapa se abre en Tiled
  pero sin imágenes (ver TASKS).
- No hay transición entre sectores ni carga de chunks (Fase 1+/Expansión).
