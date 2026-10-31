# Arquitectura — 5RAZAS

Estado: vertical slice jugable de inicio a fin (Fases 0 y 2–6 completas; Fase 1 con pendientes menores). Última actualización: 2026-10-31.

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
    progression/ Curva de XP, niveles, etapas, crecimiento de atributos.
    items/     Catálogo de objetos, inventario, equipamiento, conjuntos, tablas de botín, objetos en el suelo.
    character/ PlayerCharacter: progresión + inventario + equipo + consumibles → atributos finales.
    ecosystem/ Catálogo de plantas y PlantField (ubicación por zonas, recolección, regeneración).
    alchemy/   Elementos, libro de recetas (índice por combinación), propiedades combinadas, descubrimientos.
    quests/    Catálogo de misiones y QuestLog (estados, señales, entrega, serialización).
    narrative/ PNJ y diálogos por datos; selección de diálogo según el estado de las misiones.
    persistence/ Formato de guardado versionado, suma de verificación, validación y migraciones.
    simulation/ WorldSimulation (orquestación: jugador, combate, botín, interacción, misiones, guardado),
               CreaturePopulation (aparición, horarios, IA, selección de habilidades, jefes) y
               contentValidation (referencias cruzadas entre archivos).
    data/      Validación de JSON y contratos de configuración.
  data/        Contenido JSON: tiles, mapas Tiled, personaje, controles, combat/ (habilidades y
               estados), professions/, creatures/, items/ (objetos, conjuntos, botín), progression.json,
               plants.json, world.json (ciclo de día y noche), alchemy/ (elementos y recetas),
               narrative/ (misiones, PNJ y diálogos).
  game/        Adaptadores Phaser.
    scenes/    Boot → Menu → Game (+ Hud en paralelo).
    rendering/ Texturas provisionales, profundidades, WorldRenderer (+ transparencia por oclusión),
               CombatEffects (áreas, telegrafías, números de daño con pooling).
    entities/  PlayerView, CreatureView, efectos visuales de combate y barras de vida.
    input/     Teclado + ratón → PlayerCommand (asignaciones desde data/controls.json).
    ui/        Minimapa, marco del jugador (nivel, etapa, XP), barra de acciones (bloqueos por nivel),
               ranuras rápidas Q/F, notificaciones laterales, textos de interfaz.
    scenes/InventoryScene  Inventario y equipamiento (pausa la simulación).
    scenes/AlchemyScene    Mortero, propiedades combinadas y libro de descubrimientos (pausa la simulación).
    scenes/DialogueScene, JournalScene (J), PauseScene (Esc)  Pantallas superpuestas basadas en ui/panel.ts.
    persistence/ IndexedDbSaveStorage (API nativa, sin dependencias).
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

## Progresión, objetos y equipamiento (Fase 3)

- **Curva de XP** (`progression.json`): XP de L a L+1 = `round(base + factor × (L−1)^exponent)`, nivel máximo 100.
  Etapas por datos: Novato (1), Profesión I (22), Profesión Senior (40), Ascensión: Dios (100).
- **Atributos finales** = `applyModifiers(base + statsPerLevel × (nivel − 1), modificadores del equipo y conjuntos)`.
  `WorldSimulation.syncPlayerStats` los copia al combatiente al subir de nivel o cambiar el equipo
  (la vida/energía actuales se recortan al nuevo máximo; al subir de nivel hay curación completa si
  `fullHealOnLevelUp`).
- **Desbloqueo de habilidades** por `unlockLevel` (Embestida 2, Corte Circular 3, Protección 4, Tempestad 5).
- **XP de criaturas** = `xpReward × (1 + creatureXpPerLevel × (nivel − 1))`; el nivel de cada criatura se sortea
  en `levelRange` al aparecer y escala sus atributos con `statsPerLevel`.
- **Objetos** (`items.json`): categorías de §11, rareza, apilamiento (`maxStack`), icono provisional, `equip`
  (ranura, nivel requerido, modificadores, conjunto) y `use` (efectos de consumible y recuperación compartida).
  La validación impide equipo apilable, ranuras incompatibles con la categoría y consumibles sin efecto.
- **Inventario**: 30 ranuras (`inventoryCapacity`), apilamiento, operaciones atómicas, serializable (`toJSON`).
- **Equipamiento**: 6 ranuras (arma, cabeza, torso, piernas, pies, accesorio). Equipar devuelve la pieza anterior
  al inventario; desequipar exige espacio. Conjuntos con bonificaciones por número de piezas (2/3/5).
  MVP: Corteza (set I, nivel 1) y Raíz profunda (set II, nivel 12).
- **Botín**: tablas por datos con probabilidades independientes (`rollLoot`, determinista). Los objetos caen al
  suelo (`DropField`), se recogen automáticamente a ≤ 0,9 celdas y caducan a los 90 s. Si el inventario está
  lleno, el objeto permanece en el suelo y se avisa (como máximo cada 3 s).
- **Consumibles rápidos**: Q y F (`startingQuickSlots`, reasignables desde el inventario). Un consumible que no
  tendría efecto (vida llena) no se gasta.
- **Inventario en pantalla** (tecla I / Esc): equipo, atributos, conjuntos activos, filtros por categoría, detalle
  del objeto y acciones (Equipar, Quitar, Usar, Asignar a Q/F). Con el inventario abierto la simulación se pausa;
  las acciones pasan por `WorldSimulation` y sus eventos se entregan al HUD con `GameSession.flush()`.

## Ecosistema (Fase 4)

- **Reloj del mundo** (`world.json`, `worldClock.ts`): un día dura 600 s reales. `hourAt`, `dayAt`, rangos
  horarios que cruzan la medianoche (`[19, 6]`) y `darknessAt` (solo visual: capa nocturna sobre el mundo).
- **Fauna real del bioma** (sin atribuciones culturales), equipo `wild`: Conejo de cola de algodón y Ciervo de cola
  blanca (huidizos), Pavo silvestre (neutral) y Pecarí de collar (territorial). Cada especie define hábitat (tiles),
  comportamiento, velocidad, vida, botín, XP y horario de aparición (`spawnRules.activeHours`).
- **Comportamientos** (`CreatureBehavior`, unión discriminada):
  - `aggressive`: persigue al detectar (enemigos de la Fase 2).
  - `territorial`: ataca si el jugador entra en su territorio; deja de perseguir al salir (× 1,6).
  - `neutral`: ignora al jugador hasta recibir daño; responde durante `retaliateSeconds`.
  - `fleeing`: estado de **alerta** (se detiene y vigila, marca "!") y **huida** al acercarse o recibir daño.
  Cualquier criatura combativa dañada persigue a su atacante unos segundos aunque esté fuera de su rango.
- **Horarios**: fuera de su horario una especie no aparece ni reaparece, y sus ejemplares lejanos (> 22 celdas)
  desaparecen (evento `despawned`).
- **Plantas** (`plants.json`): las 10 especies ficticias del §10.4, con propiedades alquímicas (elemento + potencia),
  rareza, regeneración, condiciones (terreno y horario), compatibilidades y rendimiento. Se ubican por zonas
  `gather-zone` del mapa Tiled solo en celdas cuyo suelo cumpla sus condiciones.
- **Recolección** (tecla E, alcance 1,4 celdas): ingrediente al inventario (si no cabe, cae al suelo), XP y
  regeneración. Aviso en pantalla con el estado de la planta (madura, regenerándose o fuera de horario).

## Alquimia (Fase 5)

- **Recetas** (`alchemy/recipes.json`): registros de datos con ingredientes (2–4 unidades), resultado y XP de
  descubrimiento. El motor calcula una **clave canónica** (ingredientes agrupados y ordenados) y la busca en un
  índice: no hay condicionales por combinación (§10.4). La validación rechaza combinaciones duplicadas.
- **Combinaciones inválidas** (§10.5): consumen los ingredientes y producen `failedResult` (Mezcla turbia). Se
  muestran las propiedades predominantes como pista.
- **Descubrimientos**: `DiscoveryBook` registra la primera vez que se obtiene cada receta (con XP); las recetas
  conocidas pueden prepararse desde el libro. Serializable para el guardado.
- **Elementos** (`alchemy/elements.json`): Fuego (quemadura), Hielo (ralentización), Veneno (envenenamiento),
  Electricidad (descarga: +20 % daño recibido) y Viento (retroceso extra). Mecánicas fantásticas.
- **Infusión**: un elixir fija `Combatant.infusion` durante N s (una a la vez). Solo las habilidades con
  `compatibleModifiers: ["element"]` aplican el elemento: Golpe del Guardián, Embestida, Corte Circular y la
  final Tempestad Ancestral (§6.2). Los impactos y números de daño toman el color del elemento.
- **Efectos de consumibles** (`UseEffect`): `heal`, `restoreEnergy`, `applyStatus` (Celeridad, Regeneración) e
  `infusion`. Nuevo tipo de estado `healOverTime` (evento `heal`, números verdes).
- **Preparaciones de alimento** (§8): Carne asada y Caldo vital, también como recetas.
- HUD: línea de efectos activos bajo el marco del jugador (infusión y estados con tiempo restante).

## Jefe, misiones y guardado (Fase 6)

- **Centinela de las Raíces** (criatura original de fantasía, categoría `boss`) con `boss.phases` por datos:
  1. *Despertar* (100 %): golpe en arco y embestida (ataques físicos y desplazamiento).
  2. *Raíces del claro* (≤ 66 %): onda de área y **obstáculos temporales** de raíz alrededor del jugador.
  3. *Furia del bosque* (≤ 33 %): +40 % velocidad, recuperaciones ×0,7, **Tempestad de raíces** (ataque combinado
     de 4 impactos) tras la cual queda **Vulnerable** (+60 % daño recibido, 4,5 s).
  Transición de 1,5 s invulnerable entre fases. Fuera de combate y herido, se reinicia (vida y fase 1). No
  reaparece tras ser derrotado (`defeatedBosses`, persistido). Botín garantizado: Corazón de raíz (recurso raro) y
  Amuleto del Centinela (equipo especial).
- **Selección de habilidades** (`CreaturePopulation`): la primera habilidad lista de la fase cuyo alcance
  (`abilityReach`) cubre la distancia al objetivo; sirve para todas las criaturas.
- **Obstáculos dinámicos** (`DynamicObstacles`): capa de colisión sobre el mapa que usan movimiento, retroceso,
  navegación A* y apariciones; nunca se colocan sobre una entidad.
- **Misiones** (`narrative/quests.json`): objetivos `defeat`, `gather`, `discover` y `collect`; requisitos,
  recompensas de XP y objetos. `QuestLog` recibe señales del mundo (no conoce los eventos de la simulación).
- **PNJ y diálogos** (`npcs.json`, `dialogues.json`): reglas ordenadas eligen el diálogo según el estado de las
  misiones; las opciones aceptan o entregan misiones (validadas en la simulación). PNJ ubicados como objetos
  `npc` del mapa Tiled. La tecla E prioriza conversar sobre recolectar. Indicadores "!" y "?" sobre el PNJ.
- **Guardado** (§15): `SavePayload` incluye identidad, profesión, XP, posición, vida/energía, inventario, equipo,
  ranuras rápidas, recetas, misiones, tiempo del mundo, exploración (RLE), jefes derrotados y ajustes.
  `SaveData` añade versión de esquema, fecha y suma de verificación FNV-1a. `loadSave` valida integridad y
  estructura y aplica `SAVE_MIGRATIONS` en cadena; `WorldSimulation.restore` descarta referencias desconocidas con
  advertencias. Guardado manual (menú de pausa), automático cada 60 s y en hitos (entrega de misión, jefe, nivel).
  El menú principal ofrece "Continuar partida" si existe un guardado válido.

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

`window.__5RAZAS__` (solo lectura): `player()`, `exploredCells()`, `creatures()`, `cooldowns()`, `xp()`,
`level()`, `inventory()`, `equipment()`, `drops()`, `paused()`, `hour()`, `plants()`, `discoveries()`, `quests()`,
`boss()`, `save()` y `mapId`.
Lo usan las pruebas E2E.

## Limitaciones conocidas

- Sin culling por chunks: se crean ~1.000 Images de objetos; aceptable para 64 × 64, revisar al cargar sectores.
- El tileset del JSON referencia imágenes `public/placeholder/*.png` que aún no existen: el mapa se abre en Tiled
  pero sin imágenes (ver TASKS).
- No hay transición entre sectores ni carga de chunks (Fase 1+/Expansión).
- Las criaturas no colisionan entre sí ni con el jugador (pueden superponerse).
- Las criaturas pueden atacar a través de un árbol si están dentro del alcance cuerpo a cuerpo.
- La XP proviene de criaturas, caza y recolección; misiones y descubrimiento de regiones llegarán en la Fase 6.
- Los animales que huyen no evitan activamente a los enemigos ni entre sí; la fauna no interactúa con otras criaturas.
- Una sola ranura de guardado; los ajustes de usuario se guardan vacíos hasta que exista una pantalla de opciones.
- La narrativa del territorio es ficción provisional pendiente de revisión cultural (ver DECISIONS D-033).
- El progreso del personaje no se guarda todavía (IndexedDB en la Fase 6); `toJSON` ya está preparado.
- El set II (nivel 12) solo se obtiene por botín de baja probabilidad; el jefe y la fabricación lo darán más adelante.
