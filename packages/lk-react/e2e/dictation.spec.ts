import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { LRS_ENDPOINT } from './constants.js';

const TITLE = 'Listen and type the sentence';
const TRANSCRIPT = "The cat isn't on the mat.";

const form = (page: import('@playwright/test').Page) => page.getByRole('form', { name: TITLE });
const box = (page: import('@playwright/test').Page) =>
  form(page).getByRole('textbox', { name: 'Type what you hear' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(box(page)).toBeVisible();
});

test('type the sentence with one typo → check scores locally and POSTs a fill-in statement', async ({
  page,
}) => {
  const typed = "The cat isn't on the met.";
  await box(page).fill(typed);

  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await form(page).getByRole('button', { name: 'Check answers' }).click();
  const statement = (await requestPromise).postDataJSON();

  expect(statement.version).toBe('1.0.3');
  expect(statement.verb.id).toMatch(/answered$/);
  // "the cat is not on the mat" once normalised: 25 code points, one edit.
  expect(statement.result.score.scaled).toBeCloseTo(24 / 25, 5);
  expect(statement.result.response).toBe(typed);
  expect(statement.object.definition.interactionType).toBe('fill-in');

  // The marked result: one wrong word, whose hidden sentence names both
  // words, and a character-level substitution inside it.
  const words = form(page).getByRole('list', { name: 'Your answer, word by word' });
  const wrong = words.locator('.lk-dc-word[data-state="incorrect"]');
  await expect(wrong).toHaveCount(1);
  await expect(wrong.locator('.lk-visually-hidden')).toHaveText('“met” should be “mat”');
  await expect(wrong.locator('.lk-dc-op[data-op="substitute"]')).toHaveCount(1);
  await expect(words.locator('.lk-dc-word[data-state="correct"]')).toHaveCount(6);

  await form(page).getByRole('button', { name: 'Show solution' }).click();
  await expect(form(page).getByRole('blockquote', { name: 'Solution' })).toHaveText(TRANSCRIPT);
});

test('a contraction and its expansion score alike, through the authored equivalences', async ({
  page,
}) => {
  await box(page).fill('the cat is not on the mat');
  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await form(page).getByRole('button', { name: 'Check answers' }).click();
  const statement = (await requestPromise).postDataJSON();
  expect(statement.result.score.scaled).toBe(1);
});

test('two hints reveal two words, are recorded on the interaction, and never reach the statement', async ({
  page,
}) => {
  const reveal = form(page).getByRole('button', { name: /Reveal the next word/ });
  await expect(reveal).toHaveText('Reveal the next word (0 of 6 shown)');
  await reveal.click();
  await reveal.click();
  await expect(form(page).getByRole('status')).toHaveText('The cat …');
  await expect(reveal).toHaveText('Reveal the next word (2 of 6 shown)');

  await box(page).fill(TRANSCRIPT);
  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await form(page).getByRole('button', { name: 'Check answers' }).click();
  const statement = (await requestPromise).postDataJSON();

  // The statement carries the typed text and the full mark: hints are
  // recorded, never charged, and never part of the response.
  expect(statement.result.response).toBe(TRANSCRIPT);
  expect(statement.result.score.scaled).toBe(1);
  const log = page.getByRole('listitem').filter({ hasText: 'Dictation submitted' });
  await expect(log).toContainText('"hintsRevealed":2');
  await expect(log).toContainText('"score":1');
});

test('keyboard alone can reveal a hint, type, and check', async ({ page }) => {
  const reveal = form(page).getByRole('button', { name: /Reveal the next word/ });
  await reveal.focus();
  await page.keyboard.press('Enter');
  await expect(form(page).getByRole('status')).toHaveText('The …');
  // Reveal → reset → answer box → check: the order the layout promises.
  await page.keyboard.press('Tab');
  await expect(form(page).getByRole('button', { name: 'Reset hints' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(box(page)).toBeFocused();
  await page.keyboard.type('the cat');
  await page.keyboard.press('Tab');
  await expect(form(page).getByRole('button', { name: 'Check answers' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(form(page).getByRole('list', { name: 'Your answer, word by word' })).toBeVisible();
  // The check button is now disabled, so focus has left it; the solution
  // toggle is reachable and operable from the keyboard.
  await form(page).getByRole('button', { name: 'Show solution' }).focus();
  await page.keyboard.press('Space');
  await expect(form(page).getByRole('blockquote', { name: 'Solution' })).toBeVisible();
});

test('starting the slow recording pauses the normal one', async ({ page }) => {
  const normal = form(page).getByRole('group', { name: 'Recording', exact: true });
  const slow = form(page).getByRole('group', { name: 'Slow recording' });
  await normal.getByRole('button', { name: 'Play' }).click();
  const started = await page.evaluate(() => {
    const [first] = Array.from(document.querySelectorAll('.lk-dc audio'));
    return first instanceof HTMLAudioElement && !first.paused;
  });
  test.skip(!started, 'autoplay blocked in this environment');

  await slow.getByRole('button', { name: 'Play' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const [first, second] = Array.from(document.querySelectorAll('.lk-dc audio')) as [
          HTMLAudioElement,
          HTMLAudioElement,
        ];
        return { first: first.paused, second: second.paused };
      }),
    )
    .toEqual({ first: true, second: false });
});

/**
 * The four word states under forced colours, checked by computed style in a
 * real engine. The system palette replaces every colour, so what must survive
 * is the SHAPE of each mark: underline, outline, strike, glyph.
 */
test.describe('marks stay distinguishable under forced colours', () => {
  test.use({ contextOptions: { forcedColors: 'active' } });

  const THEME = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme');
  const CSS = ['defaults.css', 'skin.css']
    .map((file) => readFileSync(join(THEME, file), 'utf8'))
    .join('\n');

  const MARKED = `
    <form class="lk-dc">
      <ol class="lk-dc-words">
        <li class="lk-dc-word" data-state="correct" id="w-correct"><span class="lk-dc-word-text" aria-hidden="true">cat</span></li>
        <li class="lk-dc-word" data-state="incorrect" id="w-incorrect"><span class="lk-dc-word-text" aria-hidden="true">cta</span></li>
        <li class="lk-dc-word" data-state="incorrect" id="w-incorrect-marked"><span class="lk-dc-word-text" aria-hidden="true" data-marks="characters"><span class="lk-dc-op" data-op="equal" id="op-equal">c</span><span class="lk-dc-op" data-op="substitute" id="op-substitute">t</span><span class="lk-dc-op" data-op="equal">a</span></span></li>
        <li class="lk-dc-word" data-state="missing" id="w-missing"><span class="lk-dc-word-text" aria-hidden="true">sat</span></li>
        <li class="lk-dc-word" data-state="extra" id="w-extra"><span class="lk-dc-word-text" aria-hidden="true">now</span></li>
      </ol>
      <p class="lk-dc-diff" aria-hidden="true"><span class="lk-dc-op" data-op="missing" id="op-missing">•</span><span class="lk-dc-op" data-op="extra" id="op-extra">x</span></p>
    </form>
  `;

  test('each state keeps its own decoration and glyph', async ({ page }) => {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${MARKED}`);
    const seen = await page.evaluate(() => {
      const read = (id: string) => {
        const el = document.getElementById(id) as HTMLElement;
        const text = (el.querySelector('.lk-dc-word-text') as HTMLElement | null) ?? el;
        const cs = getComputedStyle(text);
        return {
          decoration: cs.textDecorationLine,
          style: cs.textDecorationStyle,
          outline: cs.outlineStyle,
          glyph: getComputedStyle(text, '::before').content,
          display: cs.display,
          visible: cs.visibility === 'visible' && cs.display !== 'none',
        };
      };
      return {
        forced: matchMedia('(forced-colors: active)').matches,
        correct: read('w-correct'),
        incorrect: read('w-incorrect'),
        missing: read('w-missing'),
        extra: read('w-extra'),
        marked: read('w-incorrect-marked'),
        opEqual: read('op-equal'),
        opSubstitute: read('op-substitute'),
        opMissing: read('op-missing'),
        opExtra: read('op-extra'),
        bullet: (document.getElementById('op-missing') as HTMLElement).textContent,
      };
    });

    expect(seen.forced, 'the page really is in forced-colors mode').toBe(true);

    expect(seen.correct.decoration).toBe('none');
    expect(seen.correct.outline).toBe('none');
    expect(seen.correct.glyph).toContain('✓');

    expect(seen.incorrect.decoration).toContain('underline');
    expect(seen.incorrect.style).toBe('wavy');
    expect(seen.incorrect.glyph).toContain('✗');

    expect(seen.missing.outline).toBe('dotted');
    expect(seen.missing.decoration).toBe('none');
    expect(seen.missing.glyph).toContain('∅');

    expect(seen.extra.decoration).toContain('line-through');
    expect(seen.extra.glyph).toContain('+');

    // The character marks reuse the same vocabulary, and the bullet that
    // stands in for a missing character is real text, so it cannot vanish.
    // Drawn as its marks, a wrong word has no underline of its own: the
    // substituted character's is the only one, so it stands out by shape.
    expect(seen.marked.decoration).toBe('none');
    expect(seen.marked.glyph).toContain('✗');
    expect(seen.opEqual.decoration).toBe('none');
    expect(seen.opSubstitute.style).toBe('wavy');
    expect(seen.opSubstitute.display).toBe('inline');
    expect(seen.opMissing.outline).toBe('dotted');
    expect(seen.opMissing.visible).toBe(true);
    expect(seen.bullet).toBe('•');
    expect(seen.opExtra.decoration).toContain('line-through');
  });
});
