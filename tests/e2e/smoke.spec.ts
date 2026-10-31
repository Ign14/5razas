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

test('combate: habilidades disponibles al nivel 1, bloqueo por nivel y criaturas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  const debug = () => page.evaluate(() => {
    const d = window.__5RAZAS__;
    return d ? { player: d.player(), cooldowns: d.cooldowns(), creatures: d.creatures().length, level: d.level() } : null;
  });

  const before = await debug();
  expect(before?.creatures).toBeGreaterThanOrEqual(10);
  expect(before?.level).toBe(1);

  // Corte Circular (tecla 2) se desbloquea en el nivel 3: no debe activarse.
  await page.keyboard.press('2');
  // Evasión (Espacio) y ataque básico (clic) sí están disponibles. Se sondea porque el FPS del
  // navegador headless varía y el tiempo de juego avanza por fotogramas.
  await page.keyboard.press('Space');
  await expect.poll(async () => (await debug())?.cooldowns['dodge'] ?? 0).toBeGreaterThan(0);
  expect((await debug())?.player.energy).toBeLessThan(100);
  await page.mouse.click(700, 360);
  await expect.poll(async () => (await debug())?.cooldowns['basic'] ?? 0).toBeGreaterThan(0);
  expect((await debug())?.cooldowns['power2']).toBe(0);

  await page.screenshot({ path: 'test-results/03-combat.png' });
  expect(errors).toEqual([]);
});

test('inventario: se abre con I, pausa el juego, muestra el equipo inicial y se cierra', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  const d = () => page.evaluate(() => {
    const g = window.__5RAZAS__;
    return g ? { paused: g.paused(), equipment: g.equipment(), inventory: g.inventory(), player: g.player() } : null;
  });

  const start = await d();
  expect(start?.equipment).toEqual({ weapon: 'hoja-de-corteza' });
  expect(start?.inventory).toEqual([
    { itemId: 'tonico-vital', quantity: 3 },
    { itemId: 'tonico-energia', quantity: 2 },
  ]);

  await page.keyboard.press('i');
  await expect.poll(async () => (await d())?.paused).toBe(true);
  // Con el juego en pausa, mover no tiene efecto.
  const frozen = (await d())?.player;
  await page.keyboard.down('d');
  await page.waitForTimeout(300);
  await page.keyboard.up('d');
  expect((await d())?.player.x).toBe(frozen?.x);
  await page.screenshot({ path: 'test-results/06-inventory.png' });

  await page.keyboard.press('i');
  await expect.poll(async () => (await d())?.paused).toBe(false);
  await page.keyboard.press('i');
  await expect.poll(async () => (await d())?.paused).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await d())?.paused).toBe(false);
  expect(errors).toEqual([]);
});

test('ecosistema: plantas y fauna en el mundo, reloj en marcha y recolección con E', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  const info = await page.evaluate(() => {
    const d = window.__5RAZAS__;
    return d ? { plants: d.plants().length, hour: d.hour() } : null;
  });
  expect(info?.plants).toBeGreaterThanOrEqual(25);
  expect(info?.hour).toBeGreaterThanOrEqual(8);
  // El reloj avanza con el tiempo de juego.
  await expect.poll(async () => page.evaluate(() => window.__5RAZAS__?.hour() ?? 0)).toBeGreaterThan(info?.hour ?? 0);
  // Pulsar E sin nada cerca no produce errores.
  await page.keyboard.press('e');
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
});

test('alquimia: se abre con K, pausa el juego, cambia con I y se cierra con Esc', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  const paused = () => page.evaluate(() => window.__5RAZAS__?.paused());
  await page.keyboard.press('k');
  await expect.poll(paused).toBe(true);
  await page.screenshot({ path: 'test-results/11-alchemy.png' });
  // Abrir el inventario cierra la alquimia (solo una pantalla a la vez) y el juego sigue en pausa.
  await page.keyboard.press('i');
  await page.waitForTimeout(200);
  expect(await paused()).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(paused).toBe(false);
  expect(await page.evaluate(() => window.__5RAZAS__?.discoveries())).toEqual([]);
  expect(errors).toEqual([]);
});

test('narrativa: hablar con el Vigía (E), aceptar una misión con 1 y verla en el diario (J)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  // El Vigía está a la derecha (pantalla) del punto de inicio.
  await page.keyboard.down('d');
  await page.waitForFunction(() => {
    const p = window.__5RAZAS__?.player();
    return p !== undefined && Math.hypot(p.x - 34.5, p.y - 30.5) < 1.2;
  });
  await page.keyboard.up('d');
  await page.keyboard.press('e');
  await expect.poll(() => page.evaluate(() => window.__5RAZAS__?.paused())).toBe(true);
  await page.screenshot({ path: 'test-results/14-dialogue.png' });
  await page.keyboard.press('1');
  await expect.poll(() => page.evaluate(() => window.__5RAZAS__?.quests()['senales-en-el-bosque']?.state)).toBe('active');
  await page.keyboard.press('1'); // "Adiós."
  await expect.poll(() => page.evaluate(() => window.__5RAZAS__?.paused())).toBe(false);
  await page.keyboard.press('j');
  await expect.poll(() => page.evaluate(() => window.__5RAZAS__?.paused())).toBe(true);
  await page.screenshot({ path: 'test-results/15-journal.png' });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__5RAZAS__?.paused())).toBe(false);
  expect(errors).toEqual([]);
});

test('guardado: guardar, recargar la página y continuar recupera el progreso', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  await page.keyboard.down('a');
  await page.waitForTimeout(500);
  await page.keyboard.up('a');
  const before = await page.evaluate(() => window.__5RAZAS__?.player());
  expect(await page.evaluate(() => window.__5RAZAS__?.save())).toBe(true);

  await page.reload();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(800); // el menú consulta IndexedDB
  await page.screenshot({ path: 'test-results/16-menu-continue.png' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  const after = await page.evaluate(() => window.__5RAZAS__?.player());
  expect(after?.x).toBeCloseTo(before?.x ?? 0, 1);
  expect(after?.y).toBeCloseTo(before?.y ?? 0, 1);
  expect(errors).toEqual([]);
});

test('opciones: reasignar el inventario a la tecla O desde el menú de pausa', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__5RAZAS__ !== undefined);
  const paused = () => page.evaluate(() => window.__5RAZAS__?.paused());
  await page.keyboard.press('Escape');
  await expect.poll(paused).toBe(true);
  // Menú de pausa: panel de 300 × 266 centrado; "Opciones" es el tercer botón.
  await page.mouse.click(640, Math.round((720 - 266) / 2) + 128 + 13);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/21-options.png' });
  // Fila "Inventario" (13.ª acción): botón "Cambiar" a la derecha del panel de 560 px.
  const h = 120 + 17 * 22 + 40;
  const top = Math.max(8, Math.round((720 - h) / 2));
  await page.mouse.click(Math.round((1280 - 560) / 2) + 560 - 70, top + 46 + 12 * 22 + 10);
  await page.keyboard.press('o');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await expect.poll(paused).toBe(false);
  await page.keyboard.press('i');
  await page.waitForTimeout(300);
  expect(await paused()).toBe(false); // I ya no abre el inventario
  await page.keyboard.press('o');
  await expect.poll(paused).toBe(true);
  expect(errors).toEqual([]);
});
