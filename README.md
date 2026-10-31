# 5RAZAS

RPG isométrico en pixel art (TypeScript + Phaser 3 + Vite). Prototipo en desarrollo hacia el vertical slice 0.1.0.

## Requisitos

Node ≥ 22.12.

## Comandos

| Comando | Descripción |
|---|---|
| `npm install` | Instala dependencias |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm run build` | Chequeo de tipos + build de producción en `dist/` |
| `npm run check` | Tipos + lint + pruebas unitarias |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:e2e` | Pruebas E2E (Playwright; la primera vez: `npx playwright install chromium`) |
| `npm run gen:map` | Regenera `src/data/maps/bosque-inicial.json` |
| `npm run analyze:map` | Conectividad y vista ASCII del mapa |

## Controles

| Acción | Control |
|---|---|
| Moverse | WASD o flechas |
| Ataque básico (hacia el cursor) | Clic izquierdo |
| Poderes 1, 2 y 3 | Teclas 1, 2, 3 |
| Habilidad final | R |
| Evasión | Espacio |
| Consumibles rápidos | Q, F |
| Inventario y equipo | I (Esc para cerrar) |
| Recolectar | E |
| Alquimia | K |
| Diario de misiones | J |
| Hablar con un PNJ | E |
| Menú de pausa / guardar / cerrar pantallas | Esc |

La partida se guarda en el navegador (IndexedDB): automáticamente cada minuto y en hitos, o manualmente desde el
menú de pausa. El menú principal permite continuarla.
| Comenzar partida | ENTER o clic |

Las teclas se configuran en `src/data/controls.json`.

Documentación: `docs/GAME_DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TASKS.md`, `docs/DECISIONS.md`.

El arte actual es **provisional** y generado por código. La narrativa es ficción provisional pendiente de revisión.
