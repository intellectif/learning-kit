import { copyFileSync, mkdirSync } from 'node:fs';
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
  // tsup does not process/copy CSS. Mirror the static stylesheets into dist so
  // the `./theme/defaults.css` and `./theme/skin.css` exports resolve.
  onSuccess: async () => {
    mkdirSync('dist/theme', { recursive: true });
    copyFileSync('src/theme/defaults.css', 'dist/theme/defaults.css');
    copyFileSync('src/theme/skin.css', 'dist/theme/skin.css');
  },
});
