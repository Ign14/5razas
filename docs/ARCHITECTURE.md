# Arquitectura — 5RAZAS

Estado: Fases 0 y 2 completas; Fase 1 con pendientes menores. Última actualización: 2026-10-31.

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
    movement/  Entrada abstracta → intención, orientación (8 dir), stepMotion / stepMotionCells.
    combat/    Atributos y modificadores, estados alterados, habilidades, daño, hitboxes, CombatWorld.
    creatures/ Bestiario por datos (GAME_DESIGN §9).
    professions/ Profesiones por datos (atributos base + 6 ranuras de acción).
    ai/        CreatureBrain (máquina de estados) y Navigator (línea recta o A*).
    simulation/ WorldSimulation: jugador, criaturas, IA, combate, apariciones y búfer de entrada.
    data/      Validación de JSON y contratos de configuración.
  data/        Contenido JSON: tiles, mapas Tiled, personaje, controles, combat/ (habilidades y
               estados), professions/, creatures/.
  game/        Adaptadores Phaser.
    scenes/    Boot → Menu → Game (+ Hud en paralelo).
    rendering/ Texturas provisionales, profundidades, WorldRenderer (+ transparencia por oclusión),
               CombatEffects (áreas, telegrafías, números de daño con pooling).
    entities/  PlayerView, CreatureView, efectos visuales de combate y barras de vida.
    input/     Teclado + ratón → PlayerCommand (asignaciones desde data/controls.json).
    ui/        Minimapa, marco del jugador y barra de acciones.
    session.ts Partida en curso: WorldSimulation + exploración + suscripción a eventos (sin Phaser).
    content.ts Carga y validación del contenido.
  config/      Configuración del motor Phaser.
```

Dirección de dependencias: `game → core`, `game → data`, `core → (nada externo)`.
Así el combate, la progresión y la alquimia futuros se podrán probar sin Phaser (GAME_DESIGN §13).

## Flujo de un frame

1. `PlayerInput.read()` → `PlayerCommand` { move (pantalla), aim (celdas, hacia el cursor), action, pressed }.
2. `WorldSimulation.update(dt, cmd)` (core, dt limitado a 0,1 s):
   - Jugador: búfer de entrada (0,3 s para pulsaciones nuevas), `CombatWorld.useAbility` y, si puede actuar,
     `stepMotion` con velocidad = Velocidad × multiplicadores de estados.
   - Criaturas a ≤ 22 celdas: `CreatureBrain.decide` → atacar o moverse (`Navigator`: recta o A*).
   - `CombatWorld.update`: energía, dash/retroceso con colisiones, estados (DoT), impactos pendientes.
   - Eventos de combate → muertes, XP, reapariciones programadas, reaparición del jugador (3 s).
3. `GameSession` actualiza la niebla y reenvía los eventos (`onEvent`).
4. `GameScene` dibuja: vistas por entidad, áreas/telegrafías, números flotantes, transparencia de objetos.
5. `HudScene`: minimapa, marco (vida/energía/XP), barra de acciones con recargas, avisos.

## Combate (Fase 2)

- **Atributos** (`Stats`, §4.2) con límites validados; `applyModifiers` aplica sumas y luego productos
  (base para equipo y alquimia).
- **Daño**: `(Ataque | Poder) × multiplicador × 100/(100 + Defensa)`; el daño de poder usa la mitad de la Defensa;
  crítico ×1,5; la evasión anula. Orden de tiradas fijo → determinista con RNG con semilla (`createRng`).
- **Habilidades** por datos (§6.1): categoría, tipo de daño, multiplicador, área (`arc` | `circle` | `line` | `none`),
  coste, recuperación, preparación (telegrafía), nº de impactos e intervalo, retroceso, dash, estado aplicado,
  animación, VFX, nivel de desbloqueo y modificadores compatibles.
- **Hitboxes/hurtboxes**: áreas en celdas contra círculos (`overlapsHurtbox`); `resolveArea` / `predictArea`
  sirven tanto para resolver como para telegrafiar.
- **Estados** (`statuses.json`): quemadura y envenenamiento (DoT), ralentización (velocidad) y protección
  (daño recibido). La Resistencia acorta los perjudiciales: `duración × 100/(100 + Resistencia)`. Reaplicar renueva.
- **Invulnerabilidad** tras recibir daño (jugador 0,6 s); la evasión es invulnerable durante el dash.
- **Interrupciones controladas**: un impacto interrumpe la preparación del objetivo si su retroceso ≥ `poise`
  (aplomo) del objetivo. El jugador tiene aplomo infinito.
- **Muerte y recompensas**: evento `defeated` con `xpReward` y `lootTable` (la tabla se resolverá en la Fase 3);
  reaparición por zona tras `respawnSeconds`, fuera de un radio seguro del jugador.
- **IA**: idle → deambular → perseguir (radio de detección) → atacar (alcance) → regresar (correa, se cura al llegar).
  Sin ruta de regreso posible, se queda en su sitio. Solo se actualizan criaturas a ≤ 22 celdas (§14).
- **Validación cruzada**: `validateContentReferences` comprueba profesión ↔ habilidades ↔ estados ↔ criaturas ↔ zonas.

## Sistema de coordenadas

- Celdas lógicas: la celda (i, j) ocupa [i, i+1) × [j, j+1). Las entidades usan posiciones continuas.
- Pantalla: `x = (cx − cy)·32`, `y = (cx + cy)·16` (tiles 64 × 32, proyección 2:1). Inversa exacta en `screenToCell`.
- WASD se interpreta en pantalla (W = arriba del monitor) y se convierte a celdas; la velocidad es constante en
  el espacio lógico.

## Mapas

- Formato: JSON de Tiled, orientación `isometric`, tiles 64 × 32, capas en CSV, tileset **embebido**.
- Cada tile del tileset declara la propiedad `tileId` que referencia `data/tiles.json`.
- Capas de tiles obligatorias: `ground`, `detail`, `paths`, `objects`. Grupo de objetos `markers` con un objeto `spawn`
  y objetos `spawn-zone` (propiedades `creatureId`, `count` y `radius`; el nombre del objeto es el id de la zona).
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

`window.__5RAZAS__` (solo lectura): `player()`, `exploredCells()`, `creatures()`, `cooldowns()`, `xp()` y
`mapId`. Lo usan las pruebas E2E.

## Limitaciones conocidas

- Sin culling por chunks: se crean ~1.000 Images de objetos; aceptable para 64 × 64, revisar al cargar sectores.
- El tileset del JSON referencia imágenes `public/placeholder/*.png` que aún no existen: el mapa se abre en Tiled
  pero sin imágenes (ver TASKS).
- No hay transición entre sectores ni carga de chunks (Fase 1+/Expansión).
- Las criaturas no colisionan entre sí ni con el jugador (pueden superponerse).
- Las criaturas pueden atacar a través de un árbol si están dentro del alcance cuerpo a cuerpo.
- `xp` es un contador; niveles, botín y desbloqueos por nivel llegan en la Fase 3 (hoy `unlockLevel` = 1).
