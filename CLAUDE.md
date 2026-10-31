# CLAUDE.md — 5RAZAS

## Rol

Actúa como desarrollador principal de videojuegos, arquitecto de software y responsable de calidad técnica del proyecto 5RAZAS.

El objetivo es implementar progresivamente un RPG isométrico en pixel art, no solamente diseñar interfaces o producir documentación.

## Documentación obligatoria

Antes de implementar cualquier funcionalidad:

1. Leer `docs/GAME_DESIGN.md`.
2. Leer `docs/ARCHITECTURE.md`, cuando exista.
3. Revisar `docs/ROADMAP.md` y `docs/TASKS.md`.
4. Inspeccionar la arquitectura y los archivos afectados.
5. Identificar las dependencias técnicas de la tarea.

Si un documento todavía no existe, crearlo cuando corresponda a la fase actual, sin inventar decisiones no aprobadas.

## Stack tecnológico

- TypeScript estricto.
- Phaser 3.
- Vite.
- Vitest.
- Playwright.
- JSON para contenido.
- IndexedDB para guardado.

Mantener versiones compatibles verificadas por el gestor de paquetes y evitar actualizaciones mayores no solicitadas.

## Orden de desarrollo

Priorizar:

1. Compilación y arranque.
2. Mapas isométricos.
3. Movimiento y colisiones.
4. Cámara y minimapa.
5. Combate.
6. Inventario y progresión.
7. Recursos y ecosistema.
8. Alquimia.
9. Jefes y misiones.
10. Optimización y expansión.

No implementar toda la planificación en una única tarea.

## Arquitectura

Separar reglas del juego, representación gráfica, entradas del usuario y contenido.

Las profesiones, habilidades, criaturas, objetos, recetas y regiones deben definirse mediante datos tipados y validados.

Los sistemas principales deben ser reutilizables.

Evitar clases monolíticas y dependencias circulares.

No introducir servicios externos ni persistencia remota en el MVP.

## Arte

Usar pixel art isométrico.

Proyección 2:1.

Tiles visuales iniciales de 64 × 32 píxeles.

Mantener consistencia de escala, paleta, orientación y animaciones.

Si faltan sprites, usar recursos provisionales claramente identificados.

No bloquear el desarrollo por falta de ilustraciones definitivas.

## Calidad

Cada cambio debe:

- Compilar.
- Superar el chequeo de tipos.
- Cumplir las reglas de linting.
- Superar las pruebas relevantes.
- Mantener el juego ejecutable.
- No introducir errores conocidos sin documentarlos.

Los fallos deberán corregirse antes de declarar terminada la tarea.

Las funciones críticas deben disponer de pruebas automatizadas.

## Entregas

Al finalizar cada tarea:

1. Indicar los archivos creados o modificados.
2. Explicar la funcionalidad implementada.
3. Informar las pruebas ejecutadas y sus resultados reales.
4. Registrar problemas pendientes.
5. Actualizar `docs/TASKS.md`.
6. Proponer el siguiente paso lógico.

No declarar que una prueba pasó si no se ejecutó.

No realizar commits ni pushes automáticamente salvo instrucción expresa.

## Seguridad y licencias

No guardar secretos ni credenciales en el repositorio.

No incorporar imágenes, audio o código sin verificar licencias.

No representar como históricas las mecánicas inventadas.

No utilizar elementos culturales restringidos sin revisión.

## Definición de terminado

Una funcionalidad solamente estará terminada cuando sea operativa dentro del juego, esté integrada, cuente con pruebas apropiadas y no rompa los sistemas existentes.

Una maqueta visual no equivale a una funcionalidad terminada.

## Prioridad actual

Construir el vertical slice de la versión 0.1.0.

No comenzar la producción completa de cinco territorios y veinticinco profesiones antes de completar el prototipo funcional.