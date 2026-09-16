import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The skin is documented as being built **entirely** from the design tokens,
 * and `ThemeProvider` restyles it by overriding those tokens. A `var(--lk-x)`
 * naming a token that does not exist breaks that contract silently: CSS makes
 * it invalid at computed-value time, so the property falls back to `unset`
 * rather than erroring anywhere a build or a test would notice.
 *
 * That is not hypothetical. The Written Response block shipped referencing
 * `--lk-font-family`, `--lk-border-radius-md` and `--lk-color-on-primary` —
 * none of which are tokens — so its submit button rendered with the page's
 * inherited text colour on a primary-coloured background, and the component
 * ignored the theme's font and radius entirely.
 */
const referenced = (css: string): Set<string> =>
  new Set(Array.from(css.matchAll(/var\((--lk-[a-z0-9-]+)/g), (m) => m[1] as string));

const declared = (css: string): Set<string> =>
  new Set(Array.from(css.matchAll(/(--lk-[a-z0-9-]+)\s*:/g), (m) => m[1] as string));

/**
 * Read from disk, not through Vite's `?raw` import. Under this package's Vitest
 * config a `.css` request is swallowed by the CSS handling whatever its query,
 * so `?raw` handed this suite two EMPTY strings: no token was referenced, none
 * was declared, the difference was empty, and the gate passed against any skin
 * at all — including one full of invented tokens. The declarations for these
 * three builtins come from `e2e/node-builtins.d.ts`, which the typecheck
 * project already includes, for the reason given there.
 */
const themeDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const readTheme = (file: string): string => readFileSync(join(themeDir, file), 'utf8');

describe('skin.css token contract', () => {
  it('references only tokens that defaults.css defines', () => {
    const defaultsCss = readTheme('defaults.css');
    const skinCss = readTheme('skin.css');
    const defined = declared(defaultsCss);
    const used = referenced(skinCss);

    // The gate means nothing if either side came back empty — which is exactly
    // how it passed vacuously before. Anchored on a token both files have
    // carried since the skin existed, so a loader that reads nothing, or reads
    // the wrong file, fails here by name instead of passing below.
    expect(defined.has('--lk-color-primary')).toBe(true);
    expect(used.has('--lk-color-primary')).toBe(true);

    const undefinedTokens = [...used].filter((token) => !defined.has(token)).sort();

    expect(undefinedTokens).toEqual([]);
  });
});
