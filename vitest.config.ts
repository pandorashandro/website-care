import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Phase 21 — the permanent regression-test foundation. Deliberately minimal:
 * no plugins, no test UI, no coverage tooling not already needed. Runs in
 * Node (vitest's default `environment`), never `jsdom` — every test in
 * `tests/` targets pure, server-only logic (fixability, capability, HMAC,
 * URL normalization, rollback-eligibility shape checks), not React
 * components, so no DOM environment is required.
 *
 * IMPORTANT: `server-only`'s package.json only serves its safe (no-op)
 * `empty.js` under Next.js's special `react-server` export condition — its
 * plain `default` export (what any other bundler/runtime, including plain
 * Node and Vitest, resolves) is `index.js`, which unconditionally throws
 * ("This module cannot be imported from a Client Component module").
 * Every module under test here imports `'server-only'` purely as an
 * in-Next.js-only guard against being bundled into client code; it is not
 * itself part of the logic under test. Aliasing it straight to the
 * package's own `empty.js` is the standard, minimal fix — not a mock of
 * application logic, just skipping a Next.js-bundler-specific guard that
 * has no meaning in a plain Node test run.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
})
