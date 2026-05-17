import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/MultipleChoice': 'src/components/MultipleChoice/index.tsx',
    'components/FillInTheBlanks': 'src/components/FillInTheBlanks/index.tsx',
    'hooks/useActivityState': 'src/hooks/useActivityState.ts',
    'hooks/useXAPI': 'src/hooks/useXAPI.ts',
    'theme/ThemeProvider': 'src/theme/ThemeProvider.tsx',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: true,
  external: ['react', 'react-dom', '@intellectif/lk-core'],
});
