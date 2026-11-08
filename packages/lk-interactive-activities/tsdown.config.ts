import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type UserConfig } from 'tsdown';

/**
 * Two entries, each bundled on its own so they share no chunk:
 *
 * - `.` — the contracts (validators, schemas, AI specs, styles, fonts, xAPI). No
 *   React; usable on a server.
 * - `./player` — the React players, every emitted module marked `'use client'`.
 *   It carries its own copy of the little contract code it renders with, so the
 *   directive never reaches the contracts: a server component may still call the
 *   validators from the root.
 *
 * ESM and CommonJS, each with its own declarations; ES2022; peers never bundled.
 */
const shared: UserConfig = {
  format: ['esm', 'cjs'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  // The build script empties `dist` first: two configs must not clean each other.
  clean: false,
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
};

const PLAYER_FILE = /^player(-[\w-]+)?\.(js|cjs)$/;

/**
 * Bundling drops module-level directives, so `'use client'` is written onto the
 * player's emitted files afterwards (as lk-react does).
 */
function markPlayerAsClient(dir: string): void {
  const directive = "'use client';";
  for (const name of readdirSync(dir)) {
    if (!PLAYER_FILE.test(name)) continue;
    const path = join(dir, name);
    const source = readFileSync(path, 'utf8');
    if (!source.startsWith(directive)) writeFileSync(path, `${directive}\n${source}`);
  }
}

export default defineConfig([
  { ...shared, entry: { index: 'src/index.ts' } },
  {
    ...shared,
    entry: { player: 'src/player.ts' },
    hooks: { 'build:done': () => markPlayerAsClient('dist') },
  },
]);
