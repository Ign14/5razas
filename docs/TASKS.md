# Tareas

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

- [ ] **Fase 4 — Ecosistema**: fauna real del bioma (aprobada) con comportamientos huidizo/neutral/territorial,
      10 plantas ficticias, recolección (tecla E), recursos, aparición por condiciones.
- [ ] Reordenar el inventario arrastrando objetos (hoy la API `swap` existe pero no hay interfaz).
- [ ] Descartar objetos desde el inventario.
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
