import { defineConfig } from 'tsdown';

/**
 * The published build, set as lk-core's is: ESM and CommonJS, each with its
 * own declarations, the file names the exports map names, and ES2022.
 *
 * lk-core is a peer, so it is never bundled: the assessment this package
 * returns is checked by the lk-core the host grades with.
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
