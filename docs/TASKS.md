# Tareas

## Hecho — 2026-10-31 (Fase 2: combate)

- [x] Atributos (§4.2) con modificadores y validación.
- [x] Fórmula de daño determinista (físico/poder, defensa, crítico, evasión, protección).
- [x] Habilidades por datos: Golpe del Guardián, Embestida, Corte Circular, Protección del Bosque, Tempestad Ancestral y Evasión.
- [x] Hitboxes (arco, círculo, línea) contra hurtboxes; telegrafía de ataques enemigos.
- [x] Estados: quemadura, envenenamiento, ralentización y protección; la resistencia acorta su duración.
- [x] Invulnerabilidad tras impacto, retroceso, interrupciones por aplomo, recuperación escalada por Cadencia.
- [x] Enemigos por datos (Brote Espinoso, Polilla Ceniza) y zonas de aparición en el mapa Tiled.
- [x] IA: deambular, perseguir, atacar y regresar con correa; navegación A*; solo se actualizan las criaturas cercanas.
- [x] Muerte, XP, reaparición de criaturas y del jugador.
- [x] Controles: clic (básico, hacia el cursor), 1/2/3, R y Espacio; búfer de entrada.
- [x] HUD: marco con vida/energía/XP, barra de 6 acciones con recarga y energía, avisos, pantalla de muerte.
- [x] Efectos: áreas de impacto, números de daño (con pool), destellos, tintes por estado, barrera.
- [x] Transparencia de los árboles que ocultan al jugador.
- [x] Git inicializado; un commit por fase.
- [x] Pruebas: 72 unitarias y 3 E2E.

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

## Pendiente — siguiente

- [ ] **Fase 3 — Progresión**: tabla de XP por curva, niveles y crecimiento de atributos, `unlockLevel` real,
      inventario, objetos, tablas de botín (las `lootTable` ya están referenciadas), equipamiento (2 sets) y bonificaciones.
- [ ] Animaciones de ataque propias del personaje (hoy solo idle/caminar + efectos).
- [ ] Separación entre criaturas (evitar que se superpongan).

## Pendiente — Fase 1

- [ ] Decidir fuente de verdad del mapa: seguir con el generador o editar en Tiled (requiere exportar PNG de los placeholders a `public/placeholder/`).
- [ ] Culling / chunks de objetos y prueba de rendimiento (escenario de referencia a 60 FPS).
- [ ] Capas restantes de §3.2 (elevaciones, vegetación inferior, elementos superiores) cuando haya contenido que las use.
- [ ] Minimapa ampliable (tecla M) — previsto en §3.4.
- [ ] Teclas configurables desde UI (hoy solo por JSON).
- [ ] Evaluar arte CC0 "Isometric Stone Soup" (64 × 32) como reemplazo de placeholders (ver RESEARCH).

## Problemas conocidos

- `npm audit`: 1 vulnerabilidad moderada (minimatch, ReDoS) en dependencias de desarrollo de ESLint; el "fix" sugerido degrada ESLint a 4.x, por lo que no se aplica. Sin impacto en el juego publicado.
- El bundle de producción pesa ~1,25 MB (330 kB gzip), casi todo Phaser.
