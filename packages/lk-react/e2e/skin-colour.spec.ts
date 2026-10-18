import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

/**
 * Text drawn on a surface the skin paints is the skin's colour, never the host
 * page's.
 *
 * `<ThemeProvider>` follows the system's dark preference by itself, so a page
 * that stays light gets the dark tokens: a dark surface on a light page. A
 * component with a card of its own (multiple choice, dictation) sets the text
 * on it and reads either way. A surface that sets a background but no colour,
 * inside a component with no card (a written response, a gap select, the
 * question set), draws the page's text on the theme's surface instead: black
 * on near-black, about 1.1:1. That is how the feedback on a draft and a group's
 * passage came out.
 *
 * The page's text is set to a colour nothing else uses, and no text on a
 * surface the skin paints may come out in it. Each test was checked against
 * the skin without the fix.
 */
const PAGE_COLOUR = 'rgb(1, 2, 3)';
const PAGE_STYLE = `body { color: ${PAGE_COLOUR}; }`;

/** Each text the page's colour reaches on a surface the skin painted, named. */
function inPageColour(page: Page): Promise<string[]> {
  return page.evaluate((pageColour) => {
    const name = (element: Element): string => {
      const classes = [...element.classList].filter((c) => c.startsWith('lk-'));
      return [element.tagName.toLowerCase(), ...classes].join('.');
    };
    const found: string[] = [];
    for (const element of document.querySelectorAll('body *')) {
      const text = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      if (!text || getComputedStyle(element).color !== pageColour) continue;
      let painter: Element | null = element;
      while (
        painter !== null &&
        painter !== document.body &&
        getComputedStyle(painter).backgroundColor === 'rgba(0, 0, 0, 0)'
      ) {
        painter = painter.parentElement;
      }
      if (painter === null || painter === document.body) continue;
      if ([...painter.classList].some((c) => c.startsWith('lk-'))) {
        found.push(`${name(element)} on ${name(painter)}`);
      }
    }
    return found;
  }, PAGE_COLOUR);
}

test('on the example page, no text on a surface the skin paints takes the page colour', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('radio', { name: 'Tokyo' })).toBeVisible();
  await page.addStyleTag({ content: PAGE_STYLE });

  const practice = page.getByLabel('AI help in practice', { exact: true });
  await practice.getByRole('button', { name: 'Get a hint' }).click();
  await expect(practice.getByText('Is "she" one person, or several?')).toBeVisible();
  await practice.getByRole('radio', { name: 'She are tired' }).check();
  await practice.getByRole('button', { name: 'Submit' }).click();
  await practice.getByRole('button', { name: 'Explain my answer' }).click();
  await expect(practice.getByRole('region', { name: 'Explanation' })).toBeVisible();

  const writing = page.getByLabel('Feedback on writing', { exact: true });
  await writing.getByRole('textbox').fill('Last weekend I go to the market and buyed bread.');
  await writing.getByRole('button', { name: 'Get feedback on my draft' }).click();
  await expect(writing.getByRole('region', { name: 'Feedback on your draft' })).toBeVisible();

  const coaching = page.getByLabel('Coaching on a reading', { exact: true });
  await coaching.getByRole('button', { name: 'Coach me on this reading' }).click();
  await expect(coaching.getByRole('region', { name: 'Coaching on your reading' })).toBeVisible();

  // The reading group, whose passage stays on screen beside its questions.
  const set = page.locator('section[aria-labelledby="set-heading"]');
  await set.getByRole('button', { name: 'Next' }).click();
  await set.getByRole('button', { name: 'Next' }).click();
  await expect(set.getByText('Question 3 of 5')).toBeVisible();

  expect(await inPageColour(page)).toEqual([]);
});

const THEME = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme');
const SHEETS = ['defaults.css', 'skin.css']
  .map((file) => readFileSync(join(THEME, file), 'utf8'))
  .join('\n');

/**
 * Each surface the example page never shows inside a component with no card:
 * AI help in a gap select, a written response's audio transport and its grade,
 * and a group's passage. As the components render them, except that the
 * transport's own text sets its colours, so a plain span stands in for
 * anything else it holds.
 */
const SURFACES = `
  <form class="lk-gs">
    <div class="lk-ai lk-ai-hint-area">
      <div aria-live="polite">
        <ol class="lk-ai-hints">
          <li class="lk-ai-hint"><span class="lk-ai-hint-label">Hint 1</span> <span class="lk-ai-text">Think of the tense.</span></li>
        </ol>
      </div>
    </div>
    <div class="lk-ai">
      <div aria-live="polite">
        <section class="lk-ai-panel" tabindex="-1" aria-label="Explanation">
          <p class="lk-ai-heading">Explanation</p>
          <p class="lk-ai-text">"Went" is the past of "go".</p>
        </section>
      </div>
    </div>
  </form>
  <form class="lk-wr">
    <figure class="lk-media" data-controls="minimal">
      <div class="lk-media-transport"><span>Recording</span></div>
    </figure>
    <div class="lk-wr-outcome" data-status="graded" data-passed="true">
      <p class="lk-wr-grade">Score 75%. Passed.</p>
      <ul class="lk-wr-criteria">
        <li class="lk-wr-criterion"><span class="lk-wr-criterion-name">Grammar</span> <span class="lk-wr-criterion-score">50%</span></li>
      </ul>
      <ul class="lk-wr-corrections">
        <li class="lk-wr-correction"><del class="lk-wr-correction-original">buyed</del> <ins class="lk-wr-correction-corrected">bought</ins></li>
      </ul>
    </div>
  </form>
  <section class="lk-stimulus">
    <p class="lk-stimulus-title">Tides</p>
    <div class="lk-stimulus-body" data-format="text">Along most coasts the tide comes in twice a day.</div>
  </section>
`;

test('every surface the skin paints sets the text on it, inside a component with no card', async ({
  page,
}) => {
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>${SHEETS}\n${PAGE_STYLE}</style>${SURFACES}`,
  );
  expect(await inPageColour(page)).toEqual([]);
});
