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
