import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,mjs}'],
      exclude: ['src/**/*.test.js', 'src/firestoreRules.test.js'],
      thresholds: {
        statements: 10,
        branches: 8,
        functions: 7,
        lines: 12
      }
    }
  }
});
