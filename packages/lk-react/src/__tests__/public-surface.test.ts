import { describe, expect, it } from 'vitest';
import * as barrel from '../index.js';
import * as themeEntry from '../theme/ThemeProvider.js';

/**
 * Pins the exports the published READMEs promise.
 *
 * `createTailwindTheme` was implemented, unit-tested and advertised in four
 * places (both READMEs, the subpath table and docs/styling.md) while never
 * being re-exported — so it reached no published build at all, and every
 * consumer who followed the documented import got a module-resolution error.
 * A missing re-export is invisible to every other check in this repo: the
 * source compiles, the tests of the function itself pass, and the package
 * builds. Only asserting the surface catches it.
 */
describe('published export surface', () => {
  const barrelExports = [
    'ActivitySequence',
    'FillInTheBlanks',
    'MultipleChoice',
    'StimulusPanel',
    'WrittenResponse',
    'ThemeProvider',
    'asRenderable',
    'asRenderableSequence',
    'createTailwindTheme',
    'darkTheme',
    'defaultTheme',
    'useActivityState',
    'useTheme',
    'useXAPI',
  ] as const;

  const barrelNames = Object.keys(barrel);

  it.each(barrelExports)('the barrel exports %s', (name) => {
    expect(barrelNames).toContain(name);
  });

  // The README's subpath table names these as the contents of
  // `@intellectif/lk-react/theme/ThemeProvider`.
  const themeExports = [
    'ThemeProvider',
    'createTailwindTheme',
    'darkTheme',
    'defaultTheme',
    'useTheme',
  ] as const;

  const themeNames = Object.keys(themeEntry);

  it.each(themeExports)('theme/ThemeProvider exports %s', (name) => {
    expect(themeNames).toContain(name);
  });
});
