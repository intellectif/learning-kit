import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    scoring: 'src/scoring/index.ts',
    xapi: 'src/xapi/index.ts',
    schemas: 'src/schemas/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  splitting: true,
  clean: true,
});
