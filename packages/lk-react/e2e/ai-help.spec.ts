import { expect, type Page, test } from '@playwright/test';

/**
 * AI help in a real browser, through the example app's stand-in model: what a
 * learner sees in practice, and that an exam shows none of it. The jsdom suite
 * proves the rules; this proves them in the built package, as a host installs
 * it.
 */
const practice = (page: Page) => page.getByLabel('AI help in practice', { exact: true });
const exam = (page: Page) => page.getByLabel('AI help in an exam', { exact: true });

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
