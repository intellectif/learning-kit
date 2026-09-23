import { expect, type Page, test } from '@playwright/test';

/**
 * Tries and hint costs in a real browser, from the built package: a wrong
 * answer offered another try with the right option still hidden, a right
 * second try counted after its cost, and a hint whose cost is said before it
 * is asked for and charged when the answer is marked. The jsdom suite proves
 * the rules; this proves the buttons are there to press, and styled.
 */
const tries = (page: Page) => page.getByLabel('A question with a second try', { exact: true });
const hintCost = (page: Page) => page.getByLabel('A hint that costs marks', { exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(tries(page).getByRole('radio', { name: /^The Nile/ })).toBeVisible();
});

test('a wrong answer is offered another try, and the right one waits for it', async ({ page }) => {
  const section = tries(page);
  await section.getByRole('radio', { name: /^The Danube/ }).check();
  await section.getByRole('button', { name: 'Submit' }).click();

  await expect(section.getByText('1 try left. Each costs 25% of the marks.')).toBeVisible();
  // What was chosen is marked; the right option the learner missed is not.
  await expect(section.locator('label[data-correct="false"]')).toHaveCount(1);
  await expect(section.locator('label[data-correct="true"]')).toHaveCount(0);

  const again = section.getByRole('button', { name: 'Try again' });
  await expect(again).toBeVisible();
  // The skin's primary look: filled, not the browser's default button.
  const fill = await again.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(fill).not.toBe('rgba(0, 0, 0, 0)');
  await expect(section.getByRole('button', { name: 'Show answer' })).toBeVisible();

  await again.click();
  // Back at the question: focus on its first option, the answer still chosen.
  await expect(section.getByRole('radio', { name: /^The Nile/ })).toBeFocused();
  await expect(section.getByRole('radio', { name: /^The Danube/ })).toBeChecked();
  await section.getByRole('radio', { name: /^The Nile/ }).check();
  await section.getByRole('button', { name: 'Submit' }).click();

  await expect(section.getByText(/Score 75%\. Passed\./)).toBeVisible();
  await expect(
    section.getByText(/Before hints and tries, this answer scored 100%\./),
  ).toBeVisible();
  await expect(section.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await expect(page.getByText(/Tries: scored 75% — passed/)).toBeVisible();
});

test('Show answer ends the tries and shows the right option', async ({ page }) => {
  const section = tries(page);
  await section.getByRole('radio', { name: /^The Ganges/ }).check();
  await section.getByRole('button', { name: 'Submit' }).click();
  await section.getByRole('button', { name: 'Show answer' }).click();
  await expect(section.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await expect(section.locator('label[data-correct="true"]')).toHaveCount(1);
  await expect(section.locator('#demo-tries-mc-feedback')).toBeFocused();
});

test('a hint says what it costs before it is asked for, and the mark is charged for it', async ({
  page,
}) => {
  const section = hintCost(page);
  await expect(section.getByText("Each hint costs 10% of this question's marks.")).toBeVisible();
  await section.getByRole('button', { name: 'Show hint' }).click();
  await expect(section.getByText('The past of "go" is irregular.')).toBeVisible();
  await section.getByRole('textbox').fill('went');
  await section.getByRole('button', { name: 'Check answers' }).click();
  await expect(section.getByText(/Score 90%\. Passed\./)).toBeVisible();
  await expect(
    section.getByText(/Before hints and tries, this answer scored 100%\./),
  ).toBeVisible();
});
