import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Fill in blank 1' })).toBeVisible();
});

test('a group’s passage appears with its questions, persists between them, and hides elsewhere', async ({
  page,
}) => {
  const passage = page.getByRole('region', { name: 'Tides' });
  const next = page.getByRole('button', { name: 'Next' });

  // Questions 1–2 are loose fill-in-the-blanks: no passage.
  await expect(passage).toBeHidden();
  await next.click();
  await expect(passage).toBeHidden();

  // Question 3 opens the reading group.
  await next.click();
  await expect(page.getByText('Question 3 of 5')).toBeVisible();
  await expect(passage).toBeVisible();
  await expect(page.getByText('Questions 3–5')).toBeVisible();
  await expect(passage).toContainText('pulled by the moon');

  // Same passage, still visible, on the next question of the group.
  await next.click();
  await expect(page.getByText('Question 4 of 5')).toBeVisible();
  await expect(passage).toBeVisible();

  // Back out of the group and it goes away again.
  await page.getByRole('button', { name: 'Previous' }).click();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByText('Question 2 of 5')).toBeVisible();
  await expect(passage).toBeHidden();
});

test('a grouped question scores like any other', async ({ page }) => {
  // Scoped to the pager: the page also shows a standalone Multiple Choice
  // with its own Submit button.
  const pager = page.locator('.lk-seq');
  const next = pager.getByRole('button', { name: 'Next' });
  await next.click();
  await next.click();
  await pager.getByRole('radio', { name: 'Twice a day' }).check();
  await pager.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/Question 3 \[slot 2\.0\]: scored 100% — passed/)).toBeVisible();
});
