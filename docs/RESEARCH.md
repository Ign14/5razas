# Investigación de recursos open source reutilizables (2026-10-30)

Licencias verificadas en el repositorio o página oficial salvo **[NV]** = no verificado (OpenGameArt devolvió 403).
**Nada de esto se ha incorporado aún** al proyecto; cualquier incorporación requiere registrar licencia y atribución.

## Usar / candidatos fuertes

| Recurso | Licencia | Uso propuesto |
|---|---|---|
| Formato JSON de Tiled (doc.mapeditor.org) | — | Ya adoptado: mapas isométricos, capas CSV, tileset embebido |
| Isometric Stone Soup — Screaming Brain Studios (itch.io) | CC0 | 1.895 tiles de suelo/muro **64 × 32 nativos**, con .tsx de Tiled. Fondo magenta a convertir. Sin personajes ni criaturas |
| valibot 1.5 | MIT | Validación de contratos de datos si crecen (D-005) |
| idb 8.0 (Jake Archibald) | ISC | Wrapper de IndexedDB para el guardado (Fase 6) |
| simplex-noise 4.0 | MIT | Si el generador necesita ruido de mejor calidad |
| pure-rand 8.4 | MIT | RNG con semilla para combate/botín deterministas |
| easystar.js | MIT | A* sobre cuadrícula para IA (Fase 2); alternativa: A* propio (~100 líneas) |

## Solo referencia

| Recurso | Licencia | Motivo |
|---|---|---|
| phaserjs/template-vite-ts (commit 919be730, última versión Phaser 3) | MIT | `main` ya usa Phaser 4; nuestra configuración es equivalente y más moderna |
| Grid Engine | Apache-2.0 | Movimiento por casillas (no continuo); versiones ≥2.52 exigen Phaser 4 |
| Kenney isometric packs | CC0 | Renders 3D, no pixel art; dimensiones no verificadas [NV] |
| twofactor/pogicity-demo | Código MIT; **arte no comercial** | Estudiar ordenación de profundidad; no copiar assets |

## Evitar

| Recurso | Motivo |
|---|---|
| LPC / Universal LPC Generator | Código GPL-3.0, arte mixto con CC-BY-SA/GPL; perspectiva no isométrica |
| phaser3-plugin-isometric | WIP, sin mantenimiento desde 2023 |
| Isometric Parts 2 (OGA) | Licencias mixtas incl. CC-BY-SA [NV] |
| feuvan/abyssfire, beuted/phaserwebsocketgame | Sin licencia (todos los derechos reservados) |
| seedrandom | Antiguo, sin ESM |

## Notas técnicas relevantes

- El parser Tiled de Phaser 3.90 descarta capas comprimidas y requiere tilesets embebidos → exportar en CSV.
- Phaser issue #6790 (objetos en mapas iso mal posicionados) sigue abierto → conversión manual (ya implementada).
