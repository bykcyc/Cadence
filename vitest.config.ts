import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Unit tests cover the pure logic (no Electron / GUI / ML): i18n, transcript merging,
// date formatting. Run with `npm test`.
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
