// @vitest-environment node
//
// Node, not jsdom: esbuild refuses to load in a realm whose `Uint8Array` is not
// the one its `TextEncoder` returns, which is what the jsdom environment makes.
// The page gets a window of its own below instead.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Production must mean production in a browser.
 *
 * Every other suite in this package runs in Node, where `process` exists, so
 * none of them could see that the SDK's production check read an expression no
 * bundler replaces — and that a browser, which has no `process`, therefore ran
 * the development paths in every production app. A learner was shown
 * "Activity failed to render" and a stack trace where the production fallback
 * belonged.
 *
 * So this suite does what a consumer's build does. It bundles a page for the
 * browser with esbuild, minified, with the `process.env.NODE_ENV` define a
 * production build applies, and runs the bundle as the page's own script in a
 * window whose global object has no `process` at all. The development bundle
 * is the control: the same page, built the other way, must show the
 * development errors, or this suite could not tell the two apart.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** What a stack trace or a development error puts on the page. */
const DEVELOPMENT_ERROR = /Activity failed to render|ActivitySchemaError|\bat\s+\S*:\d+:\d+/;

/** What each case shows in production: the activity itself, or the named fallback. */
const PRODUCTION: Readonly<Record<string, string>> = {
  'pronunciation-feedback': 'Score 86%. Passed.',
  'multiple-choice': 'MC question text',
  'fill-in-the-blanks': 'FIB passage',
  'gap-select': 'GS passage',
  dictation: 'DC title',
  'written-response': 'WR prompt text',
  'read-aloud': 'RA reference text.',
  'activity-sequence': 'MC question text',
  'activity-preview': '"MC title" could not be displayed.',
  'error-boundary': '"RA title" could not be displayed.',
};

/** The part of jsdom this suite uses. The package ships no types of its own. */
interface PageWindow {
  document: Document;
  close(): void;
}
type Jsdom = new (
  html: string,
  options: { runScripts: 'dangerously'; pretendToBeVisual: boolean },
) => { window: PageWindow };

async function bundle(mode: 'production' | 'development'): Promise<string> {
  const result = await build({
    entryPoints: [join(HERE, 'production-page.fixture.tsx')],
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
    logLevel: 'silent',
  });
  const [output] = result.outputFiles;
  if (output === undefined) {
    throw new Error('esbuild produced no output');
  }
  return output.text;
}

const windows: PageWindow[] = [];

afterEach(() => {
  for (const page of windows.splice(0)) {
    page.close();
  }
});

/** Loads a bundle as a page's script and returns each case's text once every case has rendered. */
async function load(code: string): Promise<{ hasProcess: boolean; cases: Map<string, string> }> {
  // The specifier is widened so the type program does not go looking for
  // declarations jsdom does not ship; `Jsdom` above says what is used.
  const { JSDOM } = (await import('jsdom' as string)) as { JSDOM: Jsdom };
  // `</script` cannot occur inside an inline script; a minified bundle may carry it in a string.
  const inline = code.replaceAll('</script', '<\\/script');
  const { window: page } = new JSDOM(
    `<!doctype html><html><body><main id="main"></main><script>${inline}</script></body></html>`,
    { runScripts: 'dangerously', pretendToBeVisual: true },
  );
  windows.push(page);

  const read = () =>
    new Map(
      [...page.document.querySelectorAll('[data-case]')].map((section) => [
        section.getAttribute('data-case') ?? '',
        section.textContent ?? '',
      ]),
    );
  const deadline = Date.now() + 20_000;
  let cases = read();
  while (
    Date.now() < deadline &&
    (cases.size < Object.keys(PRODUCTION).length ||
      [...cases.values()].some((text) => text.trim() === ''))
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    cases = read();
  }
  return { hasProcess: 'process' in page, cases };
}

describe('a production browser bundle', () => {
  it('renders every component’s production fallback, and never a stack trace', async () => {
    const { hasProcess, cases } = await load(await bundle('production'));
    // The premise: a browser has no `process`. Were the page's window to grow
    // one, this would pass for the wrong reason.
    expect(hasProcess).toBe(false);
    expect([...cases.keys()].sort()).toEqual(Object.keys(PRODUCTION).sort());
    for (const [name, expected] of Object.entries(PRODUCTION)) {
      const text = cases.get(name) ?? '';
      expect({ name, text }).toEqual({ name, text: expect.stringContaining(expected) });
      expect({ name, text }).toEqual({ name, text: expect.not.stringMatching(DEVELOPMENT_ERROR) });
    }
  }, 60_000);

  it('answers "development", and does not throw, where nothing replaced the literal and there is no `process`', async () => {
    // Code that reaches a browser unbundled. React itself cannot run like this,
    // so the page holds only the check. `neutral`, not `browser`: esbuild
    // defines the literal on its own for a browser build, which is exactly the
    // replacement this case is about the absence of.
    const result = await build({
      stdin: {
        contents:
          "import { isDevelopment } from './_internal.ts';\n" +
          'document.body.setAttribute("data-development", String(isDevelopment()));',
        resolveDir: join(HERE, '..'),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'neutral',
      logLevel: 'silent',
    });
    const [output] = result.outputFiles;
    expect(output?.text).toContain('process.env.NODE_ENV');
    const { JSDOM } = (await import('jsdom' as string)) as { JSDOM: Jsdom };
    const { window: page } = new JSDOM(
      `<!doctype html><html><body><script>${output?.text ?? ''}</script></body></html>`,
      { runScripts: 'dangerously', pretendToBeVisual: true },
    );
    windows.push(page);
    expect('process' in page).toBe(false);
    expect(page.document.body.getAttribute('data-development')).toBe('true');
  });

  it('still shows the development errors in a development bundle', async () => {
    const { hasProcess, cases } = await load(await bundle('development'));
    expect(hasProcess).toBe(false);
    for (const name of Object.keys(PRODUCTION)) {
      const text = cases.get(name) ?? '';
      expect({ name, text }).toEqual({ name, text: expect.stringMatching(DEVELOPMENT_ERROR) });
    }
  }, 60_000);
});
