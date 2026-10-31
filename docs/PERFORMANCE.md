# Rendimiento — escenario de referencia (GAME_DESIGN §14, criterio 18)

Última medición: 2026-10-31.

## Escenario

`tests/e2e/performance.spec.ts` (`npx playwright test performance`):

- Partida nueva a 1280 × 720, sector completo cargado: 6.215 elementos de mapa (suelo, variación, senderos y
  objetos), 25 criaturas, ~30 plantas, PNJ y HUD completo.
- El jugador recorre los alrededores del punto de inicio durante 12 s (la cámara se mueve sin parar).
- Se registran: FPS (`game.loop.actualFps`), tiempo de simulación por fotograma (media móvil y pico) y la fracción
  de elementos del mapa que se dibujan tras el culling.

## Presupuestos verificados automáticamente

| Métrica | Presupuesto | Medido |
|---|---|---|
| Simulación (reglas, IA, combate, misiones) | < 4 ms por fotograma de media | **0,06–0,09 ms** (pico ≈ 1 ms) |
| Elementos de mapa dibujados | < 50 % del total | **≈ 42 %** |

## FPS

| Entorno | FPS |
|---|---|
| Chromium headless con SwiftShader (renderizado por software en CPU), prueba en solitario | ≈ 32–35 |
| Mismo entorno, en paralelo con otras pruebas | ≈ 24 |
| Mismo entorno, menú principal (referencia del techo del entorno) | ≈ 60 |

El navegador headless no usa GPU: su límite es el relleno de píxeles por software, no el juego. **Pendiente**:
medir en un escritorio de gama media con GPU real (indicador F3 o `window.__5RAZAS__.perf()` en la consola) y
anotar el resultado aquí; el objetivo del diseño es 60 FPS.

## Optimizaciones aplicadas

1. **Culling por bloques de 4 × 4 celdas** con intersección exacta rombo–rectángulo (antes: todo el mapa).
2. **Texturas de suelo de 64 × 32** en lugar de 64 × 96: cada baldosa plana pintaba 3 veces más píxeles
   (transparentes) en tres capas.
3. La capa de oscuridad nocturna no se dibuja de día.
4. El HUD solo redibuja el marco del jugador, la barra de acciones y las ranuras rápidas cuando cambian.
5. La IA solo se actualiza para criaturas a ≤ 22 celdas; la navegación A* recalcula como máximo cada 0,6 s.

Resultado en el entorno por software: de ≈ 24,5 a ≈ 33 FPS en solitario.
