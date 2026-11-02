// Loads the ENTRY functions of vectors/replay.mjs from src/ for the vector
// generators (Node cannot load the `.js` specifiers of the .ts sources).
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { ENTRY } from '../vectors/replay.mjs';

export const PACKAGE = fileURLToPath(new URL('..', import.meta.url));

/**
 * Bundles the ENTRY functions and imports the bundle. It is written inside
 * the package, under the gitignored `.mutants/` as scripts/mutate.mjs's
 * bundles are, so ts-fsrs, left external, resolves as it does for the real
 * build; it is removed once imported.
 */
export async function loadSrc(name) {
  const contents = Object.entries(ENTRY)
    .map(([module, names]) => `export { ${names.join(', ')} } from './src/${module}';`)
    .join('\n');
  const outfile = join(PACKAGE, '.mutants', `${name}-${process.pid}.mjs`);
  await build({
    stdin: { contents, resolveDir: PACKAGE, loader: 'ts' },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    external: ['ts-fsrs', 'ts-fsrs/*'],
    logLevel: 'silent',
  });
  try {
    return await import(pathToFileURL(outfile).href);
  } finally {
    rmSync(outfile, { force: true });
  }
}
