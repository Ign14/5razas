# Bitácora de decisiones

## D-001 — Phaser 3.90.0 fijado (2026-10-30)
`npm latest` de Phaser es 4.x. La especificación exige Phaser 3; se fija `3.90.0` exacto. Varias librerías del
ecosistema (plantilla oficial, Grid Engine ≥2.52) ya requieren Phaser 4, así que toda dependencia nueva debe
verificarse contra 3.90.

## D-002 — TypeScript 6.0 en lugar de 7.0
TS 7.0 es el `latest`, pero typescript-eslint 8.72 solo admite `<6.1`. Se usa `~6.0.3`. Se activa
`erasableSyntaxOnly` para que el core pueda ejecutarse con `node --experimental-strip-types` (scripts de contenido).

## D-003 — Renderizado propio en lugar de `Phaser.Tilemaps`
Phaser soporta mapas isométricos de Tiled, pero dibuja cada capa con una única profundidad, lo que impide
intercalar árboles y entidades. Se carga el JSON de Tiled con un parser propio (`core/world/tiledLoader.ts`) hacia
un modelo independiente (`WorldMap`), y se renderiza con Blitters (suelo) + Images ordenadas por Y (objetos).
Además el modelo queda probado sin Phaser. Referencia: issue de Phaser #6790 (posición de objetos iso) sigue abierto.

## D-004 — Colisiones lógicas por cuadrícula, sin Arcade Physics
Arcade Physics trabaja en espacio de pantalla; en isométrico los cuerpos rectangulares no coinciden con los
rombos. Las colisiones se resuelven en espacio de celdas (AABB vs celdas bloqueadas), deterministas y testeables.

## D-005 — Validación de datos propia (sin zod/valibot por ahora)
Contratos pequeños; se evita dependencia. Si los contratos de Fase 2+ (habilidades, criaturas, recetas) crecen,
migrar a **valibot** (MIT, ~1–2 kB por esquema) — candidato preferido según RESEARCH.

## D-006 — Mapa inicial generado de forma determinista
No hay arte ni mapa diseñado. El sector se genera con semilla fija y se guarda como Tiled JSON (no se genera en
tiempo de ejecución). Pendiente decidir si pasa a edición manual en Tiled.

## D-007 — Niebla de exploración incluida en el minimapa inicial
Está en §3.4 de la especificación, es lógica pura pequeña (`ExplorationState`) y da sentido al minimapa. Se
serializa con `toArray()` para el futuro guardado.

## D-008 — Arte provisional procedural
Texturas generadas por código (prefijo `ph-`), sin assets de terceros: cero riesgo de licencias. Se reemplazarán
manteniendo claves y dimensiones.

## D-009 — Combate simulado en el core, de forma determinista (2026-10-31)
`CombatWorld` y `WorldSimulation` no usan Phaser ni `Math.random`: el tiempo y el RNG (mulberry32 con semilla) se
inyectan. Así se prueban ciclos completos de combate (aparición → pelea → muerte → XP → reaparición) en Vitest.

## D-010 — Velocidad del personaje desde el atributo Velocidad
Se eliminó `moveSpeed` de `provisional-player.json`: la velocidad sale de `baseStats.speed` de la profesión
(celdas/s), multiplicada por los estados (ralentización).

## D-011 — A* propio en lugar de easystar.js
Unas 80 líneas, síncrono, determinista, sin dependencias y con pruebas. `Navigator` va en línea recta si el camino
está despejado y recalcula la ruta como máximo cada 0,6 s para limitar el coste con muchas criaturas.

## D-012 — Búfer de entrada de 0,3 s
Las pulsaciones nuevas (teclas o clic) durante una acción en curso se guardan y se ejecutan al quedar libre el
personaje; la última reemplaza a la anterior. Mantener el clic presionado no se almacena. Lo detectaron las pruebas
E2E: sin búfer, una habilidad pulsada justo después de otra se perdía, y un clic corto podía no registrarse.

## D-013 — Aplomo (poise) en lugar de un booleano "interrumpible"
Con el booleano, el ataque básico (que tiene retroceso) interrumpía siempre y el jugador nunca recibía daño. Ahora
solo interrumpe un retroceso ≥ aplomo del objetivo (Brote Espinoso 0,6: solo Embestida y Corte Circular; Polilla 0,2).

## D-014 — Transparencia de objetos que ocultan al jugador
Los árboles situados delante del jugador se vuelven semitransparentes; dentro del bosque el personaje quedaba oculto
durante el combate.

## D-015 — Zonas de aparición fuera del alcance de detección del punto de inicio
Una zona cercana provocaba muertes en bucle al reaparecer. Una prueba verifica la distancia mínima.

## D-016 — PlayerCharacter separado de la simulación (2026-10-31)
Progresión, inventario, equipo y consumibles viven en `PlayerCharacter` (core). `WorldSimulation` solo orquesta
(XP por muertes, botín, sincronización de atributos). Evita una clase monolítica y facilita el guardado de la Fase 6.

## D-017 — Curva de XP polinómica configurable
`base + factor × (L−1)^exponent` (15, 8, 1,4): unas 70 criaturas hasta el nivel 12 con las XP actuales. El
balance se ajusta en `progression.json`; misiones y jefe completarán la progresión del vertical slice.

## D-018 — Botín en el suelo con recogida automática
Más legible que pasarlo directo al inventario y no requiere tecla de interacción (E queda para objetos
interactivos de la Fase 4). Los objetos que no caben se quedan en el suelo; nunca se pierden en silencio.

## D-019 — El inventario pausa el juego
Juego de un jugador: abrir el inventario detiene la simulación (no avanza el tiempo ni actúan las criaturas).
Las pulsaciones y clics hechos sobre el inventario se descartan para que no se conviertan en ataques al cerrar.

## D-020 — Las habilidades se desbloquean en los niveles 2 a 5
Introduce las acciones de forma gradual en los primeros minutos. Ataque básico y evasión desde el nivel 1.

## D-021 — Fauna real elegida para el bosque templado inicial (2026-10-31)
Aprobado por el usuario usar fauna real como fauna natural. Especies del continente americano con hábitats de
bosque/pradera: conejo de cola de algodón, ciervo de cola blanca, pavo silvestre y pecarí de collar. Se presentan
como animales, sin vínculo cultural ni mecánicas sobrenaturales; los comportamientos son simplificaciones de juego.

## D-022 — Ciclo de día y noche ligero
Implementado solo para las "condiciones de aparición" (§8) y las "condiciones ambientales" de las plantas (§10.1).
Su efecto visual es una capa de oscuridad. Sin iluminación dinámica (fuera de alcance del MVP).

## D-023 — Comportamientos como unión discriminada
Cada tipo de comportamiento declara solo sus parámetros (p. ej. `territoryRadius` solo en `territorial`), validados
por datos. Evita campos sin sentido y permite al compilador comprobar cada caso en la IA.

## D-024 — Recolección instantánea con bloqueo breve
Pulsar E recolecta al momento y bloquea al personaje 0,4 s. Una animación de canalización interrumpible puede
añadirse más adelante sin cambiar las reglas.

## D-025 — Índice por clave canónica para las recetas (2026-10-31)
Cumple "el sistema no podrá depender de condicionales específicos por combinación" (§10.4): agregar una receta es
agregar un registro. El orden de los ingredientes no importa; la validación impide dos recetas con la misma
combinación.

## D-026 — Las combinaciones inválidas dan un resultado menor y una pista
§10.5 permite consumir materiales sin bloquear el progreso. Se entrega una Mezcla turbia (cura 10) y se informa el
elemento predominante, para orientar la experimentación sin revelar recetas.

## D-027 — Infusión elemental como estado del combatiente, no como modificación de las habilidades
Las definiciones de habilidades no cambian; `CombatWorld` consulta la infusión activa y `compatibleModifiers` en cada
impacto. Así la alquimia "altera realmente el combate" sin duplicar habilidades por elemento.

## D-028 — Electricidad y Viento con recetas propias
El diseño lista cinco elementos (§10.3) pero solo da ejemplos para tres. Se añadieron Elixir de chispa (Hongo Azul +
2 Polvo de ceniza) y Elixir de vendaval (2 Semillas del Viento + Pluma), ambos ficticios y ajustables por datos.

## D-029 — La interacción prefiere plantas maduras
Con dos plantas al alcance, se apunta a la madura más cercana; antes, una planta recién recolectada bloqueaba la de
al lado (detectado en la prueba visual).

## D-030 — Extracción de CreaturePopulation y de la validación de contenido (2026-10-31)
`WorldSimulation` superaba las 600 líneas. La aparición, los horarios, la IA y los jefes pasaron a
`CreaturePopulation`, y las referencias cruzadas a `contentValidation.ts`. El comportamiento no cambió (todas las
pruebas existentes pasaron sin modificaciones antes de añadir el jefe).

## D-031 — Fases de jefe por datos, sin código específico del Centinela
Umbrales de vida, habilidades por fase, multiplicadores y obstáculos se declaran en `creatures.json`. La
"vulnerabilidad temporal" (§9) es un estado que la propia Tempestad de raíces aplica al jefe, sin reglas especiales.

## D-032 — Un jefe ocioso y herido se reinicia
Detectado en la prueba visual: tras la muerte del jugador el jefe se curaba pero seguía en la fase 3. Ahora vuelve a
la fase 1 con su vida y atributos originales. No se reinicia durante transiciones o ataques (la IA no actualiza su
estado mientras está ocupada), lo que evitaba curarlo justo tras un primer golpe fuerte.

## D-033 — Narrativa provisional y culturalmente neutra (pendiente de revisión humana)
El diseño pide una "historia del territorio" pero también prohíbe inventar atribuciones culturales y exige revisión
humana para contenido sensible. Se escribió una historia breve, original y neutra (Vigía del Sendero, Centinela
de las Raíces, equilibrio de los cinco territorios) sin nombres, ceremonias, símbolos ni entidades de pueblos reales.
Los archivos de `data/narrative/` lo indican en su `$comment`. Vincularla a un pueblo concreto requiere esa revisión.

## D-034 — IndexedDB nativo en lugar de la librería idb
Una sola tienda y tres operaciones: ~50 líneas sin dependencias. El formato y la validación viven en el core
(`saveGame.ts`), probados con `MemorySaveStorage`.

## D-035 — Suma de verificación FNV-1a y migraciones encadenadas
FNV-1a detecta archivos dañados o editados (no es seguridad criptográfica, innecesaria sin servidor). Cada cambio
futuro de esquema añade una función en `SAVE_MIGRATIONS` y sube `SAVE_SCHEMA_VERSION`; las pruebas cubren la cadena.

## D-036 — Esc centralizado en GameScene
Las pantallas superpuestas no manejan Esc por su cuenta: el mismo evento las cerraba y luego abría el menú de pausa.
GameScene decide: si hay una pantalla abierta la cierra; si no, abre la pausa.
