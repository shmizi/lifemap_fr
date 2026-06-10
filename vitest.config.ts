import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Vitest does not read tsconfig path aliases automatically, so we mirror the
// "@/* -> src/*" alias here. Without this, any test that imports a runtime
// value from "@/..." (constants, engine functions, etc.) fails to resolve.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    globals: false,        // we import describe/it/expect explicitly from 'vitest'
    environment: 'node',   // repositories run against fake-indexeddb, no DOM needed
  },
});
