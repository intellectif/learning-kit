import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * AI help in a real browser, through the example app's stand-in model: what a
 * learner sees in practice, and that an exam shows none of it. The jsdom suite
 * proves the rules; this proves them in the built package, as a host installs
 * it.
 */
const practice = (page: Page) => page.getByLabel('AI help in practice', { exact: true });
const exam = (page: Page) => page.getByLabel('AI help in an exam', { exact: true });

/**
 * AI help takes the width of the answer it is about: a panel or a list of
 * hints is as wide as its `.lk-ai` block. That block lines its button up at
 * the start, and a live region lined up the same way shrinks to what it holds:
 * a short explanation sat in a box only as wide as its text, and the hints
 * widened each time a longer one arrived. jsdom has no layout, so only a
 * measurement shows it.
 */
async function expectFullWidth(inner: Locator): Promise<void> {
  const { width, blockWidth } = await inner.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    blockWidth: element.closest('.lk-ai')?.getBoundingClientRect().width,
  }));
  expect(blockWidth).toBeGreaterThan(0);
  expect(width).toBeCloseTo(blockWidth ?? 0, 0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('radio', { name: 'Tokyo' })).toBeVisible();
});

test('practice: a hint, a refused hint that gave the answer away, then an explanation', async ({
  page,
}) => {
  const section = practice(page);
  await section.getByRole('button', { name: 'Get a hint' }).click();
  await expect(section.getByText('Is "she" one person, or several?')).toBeVisible();
  await expect(section.getByText('Written by AI. It can make mistakes.')).toBeVisible();
  await expectFullWidth(section.getByRole('list', { name: 'Hints' }));

  await section.getByRole('button', { name: 'Get a hint' }).click();
  await expect(section.getByText('No hint is available right now.')).toBeVisible();
  await expect(section.getByText('The answer is: she is tired.')).toHaveCount(0);
  await expect(section.getByRole('listitem')).toHaveCount(1);

  await section.getByRole('radio', { name: 'She are tired' }).check();
  await section.getByRole('button', { name: 'Submit' }).click();
  await expect(section.getByRole('button', { name: 'Get a hint' })).toHaveCount(0);
  await section.getByRole('button', { name: 'Explain my answer' }).click();
  const panel = section.getByRole('region', { name: 'Explanation' });
  await expect(panel).toContainText('not "are"');
  await expect(panel).toBeFocused();
  await expectFullWidth(panel);
  await expect(page.getByText(/AI help ai-explanation-shown/)).toBeVisible();
});

test('exam: no AI help before submit or after it, though the page connects a model', async ({
  page,
}) => {
  const section = exam(page);
  await expect(section.getByRole('radio', { name: 'She is tired' })).toBeVisible();
  await expect(section.getByRole('button', { name: 'Get a hint' })).toHaveCount(0);
  await section.getByRole('radio', { name: 'She is tired' }).check();
  await section.getByRole('button', { name: 'Submit' }).click();
  await expect(section.getByText('Answer submitted.')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Explain my answer' })).toHaveCount(0);
  await expect(section.locator('.lk-ai')).toHaveCount(0);
});

test('practice: feedback on a draft, out of date after a revision, then a reply refused for correcting words no longer there', async ({
  page,
}) => {
  const section = page.getByLabel('Feedback on writing', { exact: true });
  const draft = section.getByRole('textbox');
  const ask = section.getByRole('button', { name: 'Get feedback on my draft' });
  await draft.fill('Last weekend I go to the market and buyed bread.');
  await ask.click();

  const panel = section.getByRole('region', { name: 'Feedback on your draft' });
  await expect(panel).toContainText('A good start. Watch your past tenses.');
  await expect(panel).toBeFocused();
  await expectFullWidth(panel);
  const corrections = panel.getByRole('list', { name: 'Suggested corrections' });
  await expect(corrections.getByRole('listitem')).toHaveCount(2);
  await expect(corrections).toContainText('bought');
  await expect(corrections).toContainText('went to');
  // Grammar 0.5 at weight 2, Task 1 at weight 1: the SDK's arithmetic, not the model's.
  await expect(panel).toContainText('Indicative score: 67%. Not a grade.');
  await expect(panel).toContainText('Written by AI. It can make mistakes.');
  await expect(
    page.getByText(/Writing feedback ai-writing-feedback-shown \{"draftNumber":1,"corrections":2,/),
  ).toBeVisible();

  await draft.fill('Last weekend I went to the market and bought bread.');
  await expect(panel).toContainText('You have changed your text since this feedback.');

  // The stand-in still corrects "buyed", which the draft no longer contains.
  await ask.click();
  await expect(section.getByText('No feedback is available right now.')).toBeVisible();
  await expect(section.getByRole('region', { name: 'Feedback on your draft' })).toHaveCount(1);
  await expect(panel).toContainText('You have changed your text since this feedback.');
  await expect(
    page.getByText(/Writing feedback ai-help-refused .*"reason":"misquotes-answer"/),
  ).toBeVisible();
});

test('practice: coaching on a graded reading, on the words the engine marked, once', async ({
  page,
}) => {
  const section = page.getByLabel('Coaching on a reading', { exact: true });
  const ask = section.getByRole('button', { name: 'Coach me on this reading' });
  await ask.click();

  const panel = section.getByRole('region', { name: 'Coaching on your reading' });
  await expect(panel).toContainText('A clear reading. 2 words to practise.');
  await expect(panel).toBeFocused();
  await expectFullWidth(panel);
  // In reading order, each as the text spells it, with the sound the engine reported.
  const words = panel.getByRole('list', { name: 'Words to practise' }).getByRole('listitem');
  await expect(words).toHaveCount(2);
  await expect(words.nth(0)).toContainText('lovely');
  await expect(words.nth(0)).toContainText('Sound: ʌ, heard as ɒ');
  await expect(words.nth(0).locator('[lang="en-US"]')).toHaveText('lovely');
  await expect(words.nth(1)).toContainText('park');
  await expect(panel).toContainText('Written by AI. It can make mistakes.');
  // One per reading: the button that asked is gone.
  await expect(ask).toHaveCount(0);
  await expect(page.getByText(/Coaching ai-coaching-shown \{"words":2,/)).toBeVisible();
});
