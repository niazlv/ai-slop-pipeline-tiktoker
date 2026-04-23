import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    timeout: 60000, // 60 seconds for API calls
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  esbuild: {
    target: 'node18'
  }
});