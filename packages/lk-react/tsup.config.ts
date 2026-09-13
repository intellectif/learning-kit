import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/ActivityPreview': 'src/components/ActivityPreview/index.tsx',
    'components/ActivitySequence': 'src/components/ActivitySequence/index.tsx',
    'components/MultipleChoice': 'src/components/MultipleChoice/index.tsx',
    'components/FillInTheBlanks': 'src/components/FillInTheBlanks/index.tsx',
    'components/WrittenResponse': 'src/components/WrittenResponse/index.tsx',
    'components/StimulusPanel': 'src/components/StimulusPanel/index.tsx',
    'hooks/useActivityState': 'src/hooks/useActivityState.ts',
    'i18n/LkIntlProvider': 'src/i18n/LkIntlProvider.tsx',
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
    addUseClientDirective('dist');
  },
});

/**
 * Re-adds `'use client'` to every emitted module.
 *
 * Every entry in this package is a client component or a hook, and each source
 * file declares the directive — but bundling drops module-level directives
 * ("Module level directives cause errors when bundled, \"use client\" ... was
 * ignored"), so it reached NONE of the emitted files. Consumers importing these
 * components into a React Server Component tree got a server-component error
 * for a package whose README advertises RSC compatibility. A build banner does
 * not survive the treeshake pass either, so rewrite the files afterwards.
 */
function addUseClientDirective(dir: string): void {
  const DIRECTIVE = "'use client';";
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      addUseClientDirective(path);
      continue;
    }
    if (!/\.(js|cjs|mjs)$/.test(entry.name)) {
      continue;
    }
    const source = readFileSync(path, 'utf8');
    if (source.startsWith(DIRECTIVE)) {
      continue;
    }
    writeFileSync(
      path,
      `${DIRECTIVE}
${source}`,
    );
  }
}
