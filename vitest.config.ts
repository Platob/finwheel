import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // The game maths tests sample whole plays frame by frame (a few seconds each on a busy machine).
    testTimeout: 30_000,
  },
});
