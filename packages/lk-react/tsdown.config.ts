import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsdown';

/**
 * The published build: ESM and CommonJS with declarations for each, one set per
 * entry point, sharing chunks. As in lk-core's config, what decides what a
 * consumer installs is set rather than left to a default: the file names the
 * exports map names, and the syntax level (the tsconfig's ES2022).
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/ActivityPreview': 'src/components/ActivityPreview/index.tsx',
    'components/ActivitySequence': 'src/components/ActivitySequence/index.tsx',
    'components/MultipleChoice': 'src/components/MultipleChoice/index.tsx',
    'components/FillInTheBlanks': 'src/components/FillInTheBlanks/index.tsx',
    'components/GapSelect': 'src/components/GapSelect/index.tsx',
    'components/Dictation': 'src/components/Dictation/index.tsx',
    'components/ReadAloud': 'src/components/ReadAloud/index.tsx',
    'components/InteractiveVideo': 'src/components/InteractiveVideo/index.tsx',
    'components/PronunciationFeedback': 'src/components/PronunciationFeedback/index.tsx',
    'components/WrittenResponse': 'src/components/WrittenResponse/index.tsx',
    'components/StimulusPanel': 'src/components/StimulusPanel/index.tsx',
    'hooks/useActivityState': 'src/hooks/useActivityState.ts',
    'hooks/useSpeechRecorder': 'src/hooks/useSpeechRecorder.ts',
    'i18n/LkIntlProvider': 'src/i18n/LkIntlProvider.tsx',
    'ai/LkAiProvider': 'src/ai/LkAiProvider.tsx',
    'ai/useAiHelp': 'src/ai/useAiHelp.ts',
    'hooks/useXAPI': 'src/hooks/useXAPI.ts',
    'theme/ThemeProvider': 'src/theme/ThemeProvider.tsx',
  },
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  outExtensions: ({ format }) =>
    format === 'cjs' ? { js: '.cjs', dts: '.d.cts' } : { js: '.js', dts: '.d.ts' },
  // The host's React and lk-core, never a copy of them.
  deps: {
    neverBundle: [/^react(\/|$)/, /^react-dom(\/|$)/, /^@intellectif\/lk-core(\/|$)/],
  },
  // The stylesheets the `./theme/*.css` exports name, as they are.
  copy: [
    { from: 'src/theme/defaults.css', to: 'dist/theme' },
    { from: 'src/theme/skin.css', to: 'dist/theme' },
  ],
  hooks: {
    'build:done': () => addUseClientDirective('dist'),
  },
  // Bundling drops each file's 'use client' and says so, once per file; the
  // hook above puts it back on every emitted module. Only that notice is
  // silenced — any other warning still shows.
  inputOptions: {
    onLog(level, log, handler) {
      if (log.code === 'MODULE_LEVEL_DIRECTIVE' && log.message.includes('"use client"')) {
        return;
      }
      handler(level, log);
    },
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
