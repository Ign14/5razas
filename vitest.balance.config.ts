import { defineConfig } from 'vitest/config';

/** Banco de balance (npm run balance): simulaciones largas fuera de las pruebas normales. */
export default defineConfig({
  test: {
    include: ['tests/balance/**/*.balance.ts'],
    environment: 'node',
  },
});
