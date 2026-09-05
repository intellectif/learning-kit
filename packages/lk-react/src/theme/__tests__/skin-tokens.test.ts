import { describe, expect, it } from 'vitest';
import defaultsCss from '../defaults.css?raw';
import skinCss from '../skin.css?raw';

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

describe('skin.css token contract', () => {
  it('references only tokens that defaults.css defines', () => {
    const defined = declared(defaultsCss);
    const undefinedTokens = [...referenced(skinCss)].filter((token) => !defined.has(token)).sort();

    expect(undefinedTokens).toEqual([]);
  });
});
