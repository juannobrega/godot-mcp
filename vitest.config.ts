import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The e2e test drives a real Godot binary and a real project
    testTimeout: 120_000,
  },
});
