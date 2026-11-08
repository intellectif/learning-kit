import { defineConfig } from 'tsdown';

/**
 * The published build, set as the sibling packages are: ESM and CommonJS,
 * each with its own declarations, the file names the exports map names, and
 * ES2022. Peers are never bundled: the host supplies React, lk-core, and
 * lk-react.
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
  deps: {
    neverBundle: [
      /^react(\/|$)/,
      /^react-dom(\/|$)/,
      /^@intellectif\/lk-core(\/|$)/,
      /^@intellectif\/lk-react(\/|$)/,
    ],
  },
});
