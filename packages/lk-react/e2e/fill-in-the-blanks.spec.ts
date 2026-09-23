import { expect, type Page, test } from '@playwright/test';
import { LRS_ENDPOINT } from './constants.js';

/** The question set these blanks sit in: the page holds other blanks, with their own hints. */
const set = (page: Page) =>
  page.getByRole('region', { name: 'Question set — with a reading group' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(set(page).getByRole('textbox', { name: 'Fill in blank 1' })).toBeVisible();
});

test('fill blanks → submit fires onComplete and POSTs a valid xAPI statement', async ({ page }) => {
  await set(page).getByRole('textbox', { name: 'Fill in blank 1' }).fill('evaporation');
  await set(page).getByRole('textbox', { name: 'Fill in blank 2' }).fill('precipitation');

  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await page
    .getByRole('form', { name: 'The Water Cycle' })
    .getByRole('button', { name: 'Check answers' })
    .click();
  const statement = (await requestPromise).postDataJSON();

  expect(statement.version).toBe('1.0.3');
  expect(statement.verb.id).toMatch(/answered$/);
  // useXAPI applies XAPIConfig.activityId over the component's URN placeholder
  // (the documented identity-injection contract, wired in v1.1).
  expect(statement.object.id).toBe('https://learning-kit.test/demo');
  // Both blanks correct → partial strategy 2/2 = 1.
  expect(statement.result.score.scaled).toBe(1);

  await expect(page.getByText(/Question 1 \[slot 0\]: scored 100% — passed/)).toBeVisible();
});

test('hint button reveals the hint text', async ({ page }) => {
  await expect(set(page).getByText('Starts with the letter E')).toBeHidden();
  await set(page).getByRole('button', { name: 'Show hint' }).click();
  await expect(set(page).getByText('Starts with the letter E')).toBeVisible();
});

test('keyboard-only: type answers and submit with Enter', async ({ page }) => {
  await set(page)
    .getByRole('textbox', { name: 'Fill in blank 1' })
    .pressSequentially('evaporation');
  await set(page)
    .getByRole('textbox', { name: 'Fill in blank 2' })
    .pressSequentially('precipitation');

  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await page
    .getByRole('form', { name: 'The Water Cycle' })
    .getByRole('button', { name: 'Check answers' })
    .press('Enter');
  await requestPromise;

  await expect(page.getByText(/Question 1 \[slot 0\]: scored 100%/)).toBeVisible();
});
