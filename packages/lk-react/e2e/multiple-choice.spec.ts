import { expect, test } from '@playwright/test';
import { LRS_ENDPOINT } from './constants.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The app renders only after the MSW worker has started, so a visible
  // option proves the mock LRS is intercepting.
  await expect(page.getByRole('radio', { name: 'Tokyo' })).toBeVisible();
});

test('load → select → submit fires onComplete and POSTs a valid xAPI statement', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Tokyo' }).check();

  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Submit' }).click();
  const request = await requestPromise;

  const statement = request.postDataJSON();
  expect(statement.version).toBe('1.0.3');
  expect(statement.actor.objectType).toBe('Agent');
  expect(statement.verb.id).toMatch(/answered$/);
  expect(statement.object.id).toMatch(/^urn:learning-kit:activity:/);
  // Tokyo is the only correct option → all-or-nothing scaled score 1.
  expect(statement.result.score.scaled).toBe(1);

  await expect(page.getByText(/Multiple Choice: scored 100% — passed/)).toBeVisible();
});

test('keyboard-only: select with Space and submit with Enter', async ({ page }) => {
  await page.getByRole('radio', { name: 'Tokyo' }).press(' ');
  await expect(page.getByRole('radio', { name: 'Tokyo' })).toBeChecked();

  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Submit' }).press('Enter');
  await requestPromise;

  await expect(page.getByText(/Multiple Choice: scored 100%/)).toBeVisible();
});
