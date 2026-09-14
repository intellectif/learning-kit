import { expect, test } from '@playwright/test';
import { LRS_ENDPOINT } from './constants.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Choose the answer for gap 1' })).toBeVisible();
});

test('choose from every gap → submit scores locally and POSTs a valid xAPI statement', async ({
  page,
}) => {
  await page.getByRole('combobox', { name: 'Choose the answer for gap 1' }).selectOption('from');
  await page.getByRole('combobox', { name: 'Choose the answer for gap 2' }).selectOption('from');
  await page.getByRole('combobox', { name: 'Choose the answer for gap 3' }).selectOption('in');

  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await page
    .getByRole('form', { name: 'Prepositions of origin' })
    .getByRole('button', { name: 'Check answers' })
    .click();
  const statement = (await requestPromise).postDataJSON();

  expect(statement.version).toBe('1.0.3');
  expect(statement.verb.id).toMatch(/answered$/);
  expect(statement.result.score.scaled).toBe(1);
  // `matching`, not `fill-in`: the pattern names which gap took which choice.
  expect(statement.object.definition.interactionType).toBe('matching');
});

test('a gap left alone is an omission, not a wrong answer', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Choose the answer for gap 1' }).selectOption('from');
  await page.getByRole('combobox', { name: 'Choose the answer for gap 2' }).selectOption('from');
  // Gap 3 is deliberately untouched, sitting on the empty first entry.

  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await page
    .getByRole('form', { name: 'Prepositions of origin' })
    .getByRole('button', { name: 'Check answers' })
    .click();
  const statement = (await requestPromise).postDataJSON();

  expect(statement.result.score.scaled).toBeCloseTo(2 / 3, 5);
});

test('keyboard alone can answer every gap and submit', async ({ page }) => {
  const first = page.getByRole('combobox', { name: 'Choose the answer for gap 1' });
  await first.focus();
  await expect(first).toBeFocused();
  await first.selectOption('from');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Choose the answer for gap 2' })).toBeFocused();
});
