import { expect, type Locator, test } from '@playwright/test';

/**
 * The interactive video in a real browser: a real `<video>` decoding a real
 * file, where the unit suites stub the media element. Eight seconds of the
 * example app's test pattern, a quiz at 0:02 and a required one at 0:05.
 *
 * Real time drives it — the video plays through — so waits are for what the
 * learner would see, never for a number of seconds.
 */

const SEEN = { timeout: 20_000 };

let player: Locator;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  player = page.getByRole('region', { name: 'Interactive video' });
  await expect(player.getByRole('button', { name: 'Play' }).first()).toBeVisible();
});

test('pauses for each quiz, reports each grade, and finishes at the end', async ({ page }) => {
  await player.getByRole('button', { name: 'Play' }).first().click();

  // 0:02 — the video pauses and asks.
  const zero = player.getByRole('radio', { name: 'At zero' });
  await expect(zero).toBeVisible(SEEN);
  expect(await player.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(
    true,
  );
  await zero.check();
  await player.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/Video question \[slot [^\]]+\]: scored 100% — passed/)).toHaveCount(
    1,
  );
  await player.getByRole('button', { name: /Continue video/ }).click();

  // 0:05 — a required quiz: the video waits for the answer.
  const blank = player.getByRole('textbox', { name: 'Fill in blank 1' });
  await expect(blank).toBeVisible(SEEN);
  await blank.fill('eight');
  await player.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByText(/Video question \[slot [^\]]+\]: scored 100% — passed/)).toHaveCount(
    2,
  );
  await player.getByRole('button', { name: /Continue video/ }).click();

  // 0:08 — the end, with every question answered, is finishing.
  await expect(page.getByText('Video finished: 2 of 2 answered')).toBeVisible(SEEN);
});

test('reads its captions from the track, shows the line playing, and the whole transcript', async () => {
  // Before play, at 0:00: the first caption, drawn by the player itself.
  await expect(player.getByText('The clock starts at zero.')).toBeVisible(SEEN);

  await player.getByRole('button', { name: 'Contents and transcript' }).click();
  await player.getByRole('tab', { name: 'Transcript' }).click();
  for (const line of ['It counts the seconds.', 'And stops at eight.']) {
    await expect(player.getByText(line)).toBeVisible(SEEN);
  }
});
