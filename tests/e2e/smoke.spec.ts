import { expect, test } from '@playwright/test';

test('arranca, inicia partida y el personaje se mueve con WASD', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/01-menu.png' });

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);

  const read = () => page.evaluate(() => window.__5RAZAS__?.player());
  const start = await read();
  expect(start).toMatchObject({ x: 32.5, y: 32.5 });

  // D = derecha en pantalla = +x, -y en celdas.
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  const afterD = await read();
  expect(afterD?.x).toBeGreaterThan(32.5);
  expect(afterD?.y).toBeLessThan(32.5);
  expect(afterD?.facing).toBe('e');

  // W = arriba en pantalla = -x, -y en celdas.
  await page.keyboard.down('w');
  await page.waitForTimeout(400);
  await page.keyboard.up('w');
  const afterW = await read();
  expect(afterW?.y).toBeLessThan(afterD?.y ?? 0);
  expect(afterW?.facing).toBe('n');

  const explored = await page.evaluate(() => window.__5RAZAS__?.exploredCells() ?? 0);
  expect(explored).toBeGreaterThan(100);

  await page.screenshot({ path: 'test-results/02-game.png' });
  expect(errors).toEqual([]);
});

test('las colisiones impiden salir del mapa', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  // Caminar hacia el oeste de pantalla durante varios segundos: el borde de árboles debe detenerlo.
  await page.keyboard.down('a');
  await page.waitForTimeout(4000);
  await page.keyboard.up('a');
  const p = await page.evaluate(() => window.__5RAZAS__?.player());
  expect(p?.x).toBeGreaterThanOrEqual(0);
  expect(p?.y).toBeLessThanOrEqual(64);
  expect(p?.moving).toBe(false);
});

test('combate: habilidades consumen energía, entran en recuperación y hay criaturas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  const debug = () => page.evaluate(() => {
    const d = window.__5RAZAS__;
    return d ? { player: d.player(), cooldowns: d.cooldowns(), creatures: d.creatures().length } : null;
  });

  const before = await debug();
  expect(before?.creatures).toBeGreaterThanOrEqual(10);
  expect(before?.player.energy).toBe(100);

  // Corte Circular (tecla 2) e inmediatamente Protección (tecla 3). Se sondea porque el FPS del navegador
  // headless varía y el tiempo de juego avanza por fotogramas.
  await page.keyboard.press('2');
  await page.keyboard.press('3');
  await expect.poll(async () => (await debug())?.cooldowns['power2'] ?? 0).toBeGreaterThan(4);
  expect((await debug())?.player.energy).toBeLessThan(100);

  // La tecla 3 (Protección del Bosque) se pulsó durante la preparación del Corte Circular: el
  // búfer de entrada la ejecuta al quedar libre. Luego, evasión (Espacio) y ataque básico (clic).
  await expect.poll(async () => (await debug())?.cooldowns['power3'] ?? 0).toBeGreaterThan(10);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await debug())?.cooldowns['dodge'] ?? 0).toBeGreaterThan(0);
  await page.mouse.click(700, 360);
  await expect.poll(async () => (await debug())?.cooldowns['basic'] ?? 0).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/03-combat.png' });
  expect(errors).toEqual([]);
});
