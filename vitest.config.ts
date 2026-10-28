import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Cada pacote com testes declara o próprio projeto.
    projects: ['packages/*', 'apps/*'],
  },
});
