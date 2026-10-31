import { expect, test } from '@playwright/test';

/**
 * Escenario de referencia de rendimiento (GAME_DESIGN §14 y criterio 18 del MVP).
 * Ver docs/PERFORMANCE.md. Partida nueva a 1280 × 720; el jugador recorre los alrededores del
 * punto de inicio durante 12 s (cámara en movimiento continuo) con el sector completo cargado.
 *
 * Presupuestos verificados (independientes de la GPU, que en el navegador headless es por software):
 * - Simulación (reglas + IA + combate) < 4 ms por fotograma de media (25 % de un fotograma a 60 FPS).
 * - El culling dibuja menos del 50 % de los elementos del mapa.
 * Los FPS se registran como referencia: en headless dependen del renderizado por software.
 */
test('rendimiento: escenario de referencia', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  await page.waitForTimeout(1000);

  const samples: { fps: number; simMs: number; visible: number; total: number }[] = [];
  const route = ['d', 's', 'a', 'w'];
  for (let i = 0; i < 12; i++) {
    const key = route[i % route.length] ?? 'd';
    await page.keyboard.down(key);
    await page.waitForTimeout(1000);
    await page.keyboard.up(key);
    const p = await page.evaluate(() => window.__5RAZAS__?.perf());
    if (p) samples.push(p);
  }
  const creatures = await page.evaluate(() => window.__5RAZAS__?.creatures().length ?? 0);
  const avg = (k: 'fps' | 'simMs') => samples.reduce((n, s) => n + s[k], 0) / samples.length;
  const worstSim = await page.evaluate(() => window.__5RAZAS__?.perf().worstSimMs ?? 0);
  const drawn = Math.max(...samples.map((s) => s.visible / s.total));
  const report = {
    fpsMedio: Number(avg('fps').toFixed(1)),
    simulacionMediaMs: Number(avg('simMs').toFixed(3)),
    simulacionPicoMs: Number(worstSim.toFixed(2)),
    fraccionMaximaDibujada: Number(drawn.toFixed(3)),
    elementosMapa: samples[0]?.total ?? 0,
    criaturas: creatures,
  };
  console.log('RENDIMIENTO', JSON.stringify(report));
  await testInfo.attach('rendimiento.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });

  expect(samples.length).toBe(12);
  expect(report.simulacionMediaMs).toBeLessThan(4);
  expect(report.fraccionMaximaDibujada).toBeLessThan(0.5);
});
