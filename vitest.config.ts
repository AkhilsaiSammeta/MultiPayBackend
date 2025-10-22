import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts', 'src/**/*.test.ts', 'tests/**/*.test.ts']
  }
});
