import { defineConfig } from 'tsdown';

/**
 * The published build: ESM and CommonJS, each with its own declarations, one
 * set per entry point, sharing chunks between them.
 *
 * Everything that decides what a consumer installs is set here rather than
 * left to a default, since tsdown's differ from tsup's, which this replaced:
 * the file names (`.js` / `.cjs`, `.d.ts` / `.d.cts`, which the exports map
 * names), and the syntax level (the tsconfig's ES2022, where tsdown would read
 * one from `engines.node`).
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    scoring: 'src/scoring/index.ts',
    xapi: 'src/xapi/index.ts',
    schemas: 'src/schemas/index.ts',
    'ai-check': 'src/ai-check/index.ts',
  },
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  // An import of zod whose bindings nothing uses is dropped, not kept for its
  // effects. A declaration file otherwise kept `import "zod/v4"` where no zod
  // type is left: zod is private, and a consumer's compiler should not have to
  // resolve it. Every JavaScript import of zod uses what it imports.
  treeshake: {
    moduleSideEffects: (id, external) => !(external && /^zod(\/|$)/.test(id)),
  },
  outExtensions: ({ format }) =>
    format === 'cjs' ? { js: '.cjs', dts: '.d.cts' } : { js: '.js', dts: '.d.ts' },
});
