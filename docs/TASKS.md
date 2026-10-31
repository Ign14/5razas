# Tareas

## Hecho — 2026-10-31 (publicación)

- [x] Repositorio público: https://github.com/Ign14/5razas
- [x] Juego publicado en GitHub Pages: https://ign14.github.io/5razas/ (verificado: carga sin errores de consola).
- [x] `npm run deploy` publica `dist/` en la rama `gh-pages`; flujo de GitHub Actions (`.github/workflows/deploy.yml`) preparado, en modo manual.
- [x] Licencia MIT (`LICENSE`) y sección «Contribuir» en el README.

## Hecho — 2026-10-31 (pulido)

- [x] Escenario de referencia de rendimiento automatizado y documentado (`docs/PERFORMANCE.md`).
- [x] Culling por bloques; texturas de suelo ajustadas; HUD con redibujado condicional; indicador F3.
- [x] Mapa ampliado (M) con niebla, leyenda y marcadores; marcadores en el minimapa.
- [x] Animaciones de ataque, giro, lanzamiento y carga del personaje.
- [x] Pantalla de opciones: teclas configurables con detección de conflictos, guardadas por usuario.
- [x] Banco de balance del jefe (`npm run balance`) y ajuste de su vida (900 → 1.300).
- [x] Pruebas: 149 unitarias, 10 E2E (incluye rendimiento y reasignación de teclas).


## Hecho — 2026-10-31 (Fase 6: jefe, narrativa y guardado) — vertical slice jugable de inicio a fin

- [x] Refactor: `CreaturePopulation` y `contentValidation` extraídos de `WorldSimulation`.
- [x] Centinela de las Raíces con tres fases, obstáculos temporales, ataque combinado y vulnerabilidad.
- [x] Barra de jefe con fases, avisos de fase y de victoria; botín especial; no reaparece.
- [x] Cuatro misiones encadenadas (combate, recolección, alquimia, jefe) con recompensas.
- [x] PNJ "Vigía del Sendero" con diálogos según el estado de las misiones; indicadores "!" y "?".
- [x] Diario de misiones (J), seguimiento en el HUD, menú de pausa (Esc).
- [x] Guardado en IndexedDB: manual, automático y en hitos; continuar desde el menú; versión, suma de
      verificación, validación y migraciones.
- [x] Pruebas: 146 unitarias y 8 E2E.


## Hecho — 2026-10-31 (Fase 5: alquimia)

- [x] Motor de recetas por datos (9 recetas: las 5 del diseño, electricidad, viento y 2 preparaciones de alimento).
- [x] Combinaciones inválidas con resultado menor y pista de propiedades.
- [x] Libro de descubrimientos con XP por primer descubrimiento y preparación rápida de recetas conocidas.
- [x] Cinco elementos con efectos en los ataques compatibles (incluida la habilidad final).
- [x] Efectos temporales: Celeridad, Regeneración (curación periódica) y Descarga.
- [x] Pantalla de alquimia (tecla K), efectos activos en el HUD, colores elementales en impactos y daño.
- [x] Pruebas: 130 unitarias y 6 E2E.


## Hecho — 2026-10-31 (Fase 4: ecosistema)

- [x] Reloj del mundo (día de 10 min) con hora y día en el HUD y oscuridad nocturna.
- [x] Cuatro especies de fauna real con hábitat, horario, botín y comportamientos huidizo, neutral y territorial.
- [x] Estado de alerta y huida de la fauna con indicador visual.
- [x] Las 10 plantas ficticias del diseño con propiedades alquímicas, rareza, terreno, horario y regeneración.
- [x] Zonas de recolección en el mapa Tiled; recolección con E, avisos y XP.
- [x] 13 objetos nuevos (10 ingredientes, carne, cuero, pluma) y pestaña "Ingredientes" en el inventario.
- [x] Aparición y desaparición de criaturas según su horario.
- [x] Pruebas: 115 unitarias y 5 E2E.


## Hecho — 2026-10-31 (Fase 3: progresión)

- [x] Curva de XP configurable, niveles 1–100, etapas Novato / Profesión I / Senior / Ascensión.
- [x] Crecimiento de atributos por nivel (profesión y criaturas) y curación al subir de nivel.
- [x] Desbloqueo de habilidades por nivel con aviso en pantalla.
- [x] Criaturas con nivel aleatorio en su rango y XP escalada por nivel.
- [x] Catálogo de 15 objetos (materiales, consumibles, accesorio y dos conjuntos completos) validado por datos.
- [x] Inventario de 30 ranuras con apilamiento y filtros por categoría.
- [x] Equipamiento en 6 ranuras, requisitos de nivel y bonificaciones de conjunto (2/3/5 piezas).
- [x] Tablas de botín, objetos en el suelo con recogida automática y caducidad.
- [x] Consumibles (vida/energía) con recuperación compartida y ranuras rápidas Q/F.
- [x] HUD: nivel, etapa, barra de XP, bloqueos por nivel, notificaciones, aviso de nivel.
- [x] Pantalla de inventario (I/Esc) que pausa el juego.
- [x] Pruebas: 99 unitarias y 4 E2E.


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

- [ ] **Revisión humana de la narrativa** (D-033) antes de asociarla a un pueblo o territorio cultural.
- [ ] Medir FPS en un equipo con GPU real (F3) y anotarlo en `docs/PERFORMANCE.md`.
- [ ] Pruebas de juego reales para confirmar la dificultad del jefe y el ritmo de progresión.
- [ ] Arte definitivo (evaluar Isometric Stone Soup, CC0) y audio (no hay sonido todavía).
- [ ] Reordenar el inventario arrastrando objetos (hoy la API `swap` existe pero no hay interfaz).
- [ ] Descartar objetos desde el inventario.
- [ ] Separación entre criaturas (evitar que se superpongan).

## Pendiente — Fase 1

- [ ] Decidir fuente de verdad del mapa: seguir con el generador o editar en Tiled (requiere exportar PNG de los placeholders a `public/placeholder/`).
- [ ] Capas restantes de §3.2 (elevaciones, vegetación inferior, elementos superiores) cuando haya contenido que las use.
- [ ] Evaluar arte CC0 "Isometric Stone Soup" (64 × 32) como reemplazo de placeholders (ver RESEARCH).

## Problemas conocidos

- GitHub Actions no arranca en la cuenta ("account is locked due to a billing issue"): CI y despliegue automático no disponibles hasta resolverlo en GitHub → Settings → Billing. Mientras tanto, despliegue manual con `npm run deploy`.
- `npm audit`: 1 vulnerabilidad moderada (minimatch, ReDoS) en dependencias de desarrollo de ESLint; el "fix" sugerido degrada ESLint a 4.x, por lo que no se aplica. Sin impacto en el juego publicado.
- El bundle de producción pesa ~1,25 MB (330 kB gzip), casi todo Phaser.
