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
