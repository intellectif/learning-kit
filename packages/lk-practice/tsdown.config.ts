import { defineConfig } from 'tsdown';

/**
 * The published build, set as lk-core's is: ESM and CommonJS, each with its
 * own declarations, the file names the exports map names, and ES2022.
 *
 * The root entry neither bundles nor imports lk-core: this package has no
 * dependency on it, and `scripts/verify-dist.mjs` fails a build that names it.
 */
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  outExtensions: ({ format }) =>
    format === 'cjs' ? { js: '.cjs', dts: '.d.cts' } : { js: '.js', dts: '.d.ts' },
});
