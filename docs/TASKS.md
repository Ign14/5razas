# Tareas

## Hecho — 2026-10-30 (Fase 0 + base de Fase 1)

- [x] Proyecto Vite 8 + TypeScript 6 estricto + Phaser 3.90.0.
- [x] Vitest (34 pruebas unitarias), Playwright (2 pruebas E2E), ESLint `strictTypeChecked`.
- [x] Regla ESLint que impide importar Phaser desde `src/core` y `src/data`.
- [x] Proyección isométrica 2:1 (64 × 32) pura y probada.
- [x] Catálogo de tiles por datos validado (`data/tiles.json`).
- [x] Cargador de mapas Tiled JSON con validación completa.
- [x] Generador determinista del sector 64 × 64 `bosque-inicial` (lago, senderos, bosque, rocas, cantera).
- [x] Colisiones lógicas AABB con deslizamiento y anti-túnel.
- [x] Movimiento continuo WASD (y flechas), velocidad desde datos, 8 orientaciones.
- [x] Personaje provisional con animación idle/caminar en 8 direcciones (procedural).
- [x] Ordenamiento de profundidad objetos/entidades.
- [x] Cámara con seguimiento suave y límites del mapa.
- [x] Escenas Boot (validación + error visible), Menú, Juego y HUD.
- [x] Minimapa isométrico con niebla de exploración, posición y orientación, nombre del sector y coordenadas.
- [x] Documentación: ARCHITECTURE, ROADMAP, TASKS, DECISIONS, RESEARCH.

## Pendiente — Fase 1

- [ ] Decidir fuente de verdad del mapa: seguir con el generador o editar en Tiled (requiere exportar PNG de los placeholders a `public/placeholder/`).
- [ ] Inicializar repositorio git (no realizado: requiere autorización).
- [ ] Culling / chunks de objetos y prueba de rendimiento (escenario de referencia a 60 FPS).
- [ ] Capas restantes de §3.2 (elevaciones, vegetación inferior, elementos superiores) cuando haya contenido que las use.
- [ ] Minimapa ampliable (tecla M) — previsto en §3.4.
- [ ] Teclas configurables desde UI (hoy solo por JSON).
- [ ] Evaluar arte CC0 "Isometric Stone Soup" (64 × 32) como reemplazo de placeholders (ver RESEARCH).

## Problemas conocidos

- `npm audit`: 1 vulnerabilidad moderada (minimatch, ReDoS) en dependencias de desarrollo de ESLint; el "fix" sugerido degrada ESLint a 4.x, por lo que no se aplica. Sin impacto en el juego publicado.
- El bundle de producción pesa ~1,25 MB (330 kB gzip), casi todo Phaser.
