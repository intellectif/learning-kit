import { expect, test } from '@playwright/test';
import { LRS_ENDPOINT } from './constants.js';

/**
 * The read-aloud path end to end, in a real engine and from the keyboard alone.
 *
 * Nothing else in the repo exercises this chain: a jsdom test drives fakes for
 * `getUserMedia`, `AudioContext` and `AudioWorkletNode`, so it proves the
 * component's logic and nothing about the capture. Here a real browser opens a
 * real (synthetic) microphone, the worklet runs on a real audio thread, the
 * hook resamples and encodes a real WAV, and the example app measures those
 * bytes with `inspectWav` and grades them with `gradeReadAloud`. Every link in
 * that chain is load-bearing: the audio the browser plays into it is deliberate
 * rather than incidental, and `fake-speech.ts` explains what breaks without it.
 *
 * "Keyboard alone" is the other half. A learner who cannot use a pointer must
 * be able to start a take, end it, hear it back and submit it, and the awkward
 * moment is the one in the middle — the record control changes its words when
 * recording starts, and if it changed its ELEMENT the keyboard would be left
 * standing on the page body with a recording running. Every activation below is
 * a key press on a control this spec has just asserted the focus of.
 */

const TITLE = 'Read the sentence aloud';

/**
 * How long a take runs. Four seconds is not a round number for its own sake:
 * the demo refuses a take whose recognised words outrun its voiced audio, and
 * the canned evidence claims eleven words, so anything under about two seconds
 * of sound is correctly thrown out before a single mark is drawn.
 */
const TAKE_SECONDS = 4;

/** The reference sentence's words, and how the demo's canned evidence marks them. */
const WORD_COUNT = 12;
const MISPRONOUNCED = 'lovely';
const OMITTED = 'park';

/** What that evidence claims it heard — the response the statement carries. */
const RECOGNISED = 'The weather is lovely today so we will walk to the';

/** (86 × 3 + 78 + 92) ÷ 5, the item's own dimension weights. */
const SCALED = 0.856;

const form = (page: import('@playwright/test').Page) => page.getByRole('form', { name: TITLE });

/** The demo page's own activity log, which is where the app reports what it did. */
const log = (page: import('@playwright/test').Page) => page.locator('ul[aria-live="polite"] > li');

/** `Recording: 4 of 20 seconds` → 4, or -1 before the counter exists. */
const secondsIn = (text: string | null): number =>
  Number(/Recording: (\d+) of \d+ seconds/.exec(text ?? '')?.[1] ?? -1);

/**
 * Tabs forward until the submit control has focus, reporting every stop on the
 * way as `TAG.class`.
 *
 * A bounded walk rather than a fixed number of presses, and a walk rather than
 * `toBeFocused()`, for one reason: the take sits between the recorder and the
 * submit button, and chromium draws a media element's controls in a shadow
 * root. Focus stops on each of them in turn — three, in the chromium this suite
 * pins — while `document.activeElement` stays the `<audio>` host, so
 * Playwright's focus assertion cannot see them at all and the count is
 * chromium's business rather than this package's.
 * What the spec is entitled to pin is the ORDER: the learner's own recording
 * first, then the control that sends it, and nothing else in between.
 */
async function tabToSubmit(page: import('@playwright/test').Page): Promise<string[]> {
  const visited: string[] = [];
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const active = document.activeElement;
      return active === null ? '' : `${active.tagName}.${active.className}`;
    });
    visited.push(stop);
    if (stop === 'BUTTON.lk-ra-submit') {
      break;
    }
  }
  return visited;
}

test.beforeEach(async ({ page }) => {
  // Four of these seconds are a recording playing in real time, which no
  // machine makes faster, and CI runners are several times slower than a
  // developer's box at everything else — so the default budget would be spent
  // on the audio rather than on the page. This is the one spec in the suite
  // whose duration is set by something other than how fast the code runs.
  test.slow();
  await page.goto('/');
  // The app renders only once the MSW worker has started, so a visible control
  // proves the mock LRS is intercepting.
  await expect(form(page).getByRole('button', { name: 'Record', exact: true })).toBeVisible();
});

/**
 * One take, recorded and submitted without a pointer.
 *
 * Shared by both tests because the take costs four seconds of wall clock and
 * neither test can assert anything without one.
 */
async function readTheSentenceAloud(page: import('@playwright/test').Page): Promise<void> {
  const record = form(page).getByRole('button', { name: 'Record', exact: true });
  await record.focus();
  await expect(record).toBeFocused();
  await page.keyboard.press('Enter');

  // Recording rewrites the control's words, not its element, so focus survives
  // the transition — and the next key press reaches the control that ends the
  // take rather than the page body.
  const stop = form(page).getByRole('button', { name: 'Stop recording' });
  await expect(stop).toBeFocused();

  // The elapsed time is counted from the samples the capture graph delivered,
  // never from a clock, so waiting on it measures audio that actually arrived.
  // A microphone that opened but delivered nothing would hang here rather than
  // sail on to fail somewhere less informative.
  await expect
    .poll(async () => secondsIn(await form(page).locator('.lk-ra-progress').textContent()), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(TAKE_SECONDS);
  await page.keyboard.press('Enter');

  // Ended, and the same element again — now offering the take the budget allows.
  await expect(form(page).getByRole('button', { name: 'Record again' })).toBeFocused();

  // Wait for the browser to have loaded the take before walking past it: a
  // media element chromium has not read yet has no controls to put in the tab
  // order, so tabbing early would prove the opposite of what this asserts and
  // would do it intermittently.
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (document.querySelector('audio.lk-ra-take') as HTMLAudioElement | null)?.readyState ?? 0,
      ),
    )
    .toBeGreaterThan(0);

  // The take, then the submit control: the order the layout promises, and the
  // reason the learner's own recording is reachable at all without a pointer —
  // they can hear what they made before deciding to send it.
  const visited = await tabToSubmit(page);
  expect(visited.at(0), 'the take player comes first').toBe('AUDIO.lk-ra-take');
  expect(visited.at(-1), 'and the submit control is reached').toBe('BUTTON.lk-ra-submit');
  expect(new Set(visited.slice(0, -1)), 'with nothing else in between').toEqual(
    new Set(['AUDIO.lk-ra-take']),
  );
  await expect(form(page).getByRole('button', { name: 'Submit', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
}

test('keyboard alone: record the sentence, submit it, and read the marks back', async ({
  page,
}) => {
  await expect(form(page).locator('.lk-ra-takes')).toHaveText('3 of 3 recordings left');

  await readTheSentenceAloud(page);

  // A take was spent, and the learner keeps the one they made: it is an audio
  // element with controls and a name of its own, not a blob nobody can reach.
  await expect(form(page).getByLabel('Your recording')).toHaveAttribute('data-take', '1');
  await expect(form(page).locator('.lk-ra-takes')).toHaveText('2 of 3 recordings left');

  const words = form(page).getByRole('list', { name: 'Your reading, word by word' });
  await expect(words.locator('.lk-pf-word')).toHaveCount(WORD_COUNT);

  // Each state's own sentence is the announcement; the visible word is
  // decoration. Both are asserted, because a mark that reaches only the eye is
  // half a mark.
  const mispronounced = words.locator('.lk-pf-word[data-state="mispronounced"]');
  await expect(mispronounced).toHaveCount(1);
  await expect(mispronounced.locator('.lk-visually-hidden')).toHaveText(
    `“${MISPRONOUNCED}” was mispronounced`,
  );
  await expect(mispronounced.locator('.lk-pf-word-text')).toHaveText(MISPRONOUNCED);

  const omitted = words.locator('.lk-pf-word[data-state="omitted"]');
  await expect(omitted).toHaveCount(1);
  await expect(omitted.locator('.lk-visually-hidden')).toHaveText(`“${OMITTED}” was not read`);

  await expect(words.locator('.lk-pf-word[data-state="correct"]')).toHaveCount(WORD_COUNT - 2);
  // Nothing was added: the evidence carries no insertion, and a state nobody
  // earned must not be drawn.
  await expect(words.locator('.lk-pf-word[data-state="inserted"]')).toHaveCount(0);

  await expect(form(page).locator('.lk-pf-score')).toHaveText('Score 86%. Passed.');

  // The dimensions, and the rule that survives only if it is checked where a
  // learner sees it: the item weights no prosody and nothing measured any, so
  // that row reads "Not assessed" — never 0%, which would be a failing mark
  // for something nobody listened for.
  const dimension = (name: string) =>
    form(page).locator(`.lk-pf-dimension[data-dimension="${name}"] .lk-pf-dimension-score`);
  await expect(dimension('accuracy')).toHaveText('86%');
  await expect(dimension('fluency')).toHaveText('78%');
  await expect(dimension('completeness')).toHaveText('92%');
  await expect(dimension('prosody')).toHaveText('Not assessed');

  // One word's detail, opened from the keyboard.
  const details = form(page).getByRole('button', { name: `Details for “${MISPRONOUNCED}”` });
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await details.focus();
  await expect(details).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('aria-expanded', 'true');

  const panel = form(page).locator('.lk-pf-word-detail');
  await expect(panel.locator('.lk-pf-syllables li').first()).toHaveText('love (spelled “love”)');
  await expect(panel.locator('.lk-pf-phoneme-symbol').first()).toHaveText('l');
  // The sound that went wrong, and what the engine heard instead of it.
  await expect(panel.locator('.lk-pf-heard-as li')).toHaveText(['ɒ']);

  // Two notes that are shown only past the thresholds this page passes.
  await expect(form(page).locator('.lk-pf-alphabet')).toHaveText(
    'Sounds are written in the International Phonetic Alphabet.',
  );
  await expect(form(page).locator('.lk-pf-monotone')).toHaveText(
    'Your reading stayed on one note. Try varying your pitch.',
  );
});

test('the grade is built from the bytes that were captured, and the statement carries it', async ({
  page,
}) => {
  const requestPromise = page.waitForRequest(
    (r) => r.url() === LRS_ENDPOINT && r.method() === 'POST',
  );
  await readTheSentenceAloud(page);
  const statement = (await requestPromise).postDataJSON();

  expect(statement.version).toBe('1.0.3');
  expect(statement.verb.id).toMatch(/answered$/);
  // A spoken answer has no cmi.interaction shape that fits it; the registry
  // says so with `other` rather than pretending it is a fill-in.
  expect(statement.object.definition.interactionType).toBe('other');
  expect(statement.result.response).toBe(RECOGNISED);
  expect(statement.result.score.scaled).toBeCloseTo(SCALED, 5);

  // What the demo measured of the file the hook encoded. This is the assertion
  // that makes the rest of the spec mean something: the grade exists only
  // because these bytes were speech-shaped, and a browser that captured
  // silence, or nothing, would be refused here by the app's own policy rather
  // than quietly scored.
  const measured = await log(page).filter({ hasText: 'take measured' }).textContent();
  const [, durationMs, voicedMs] = /: ([\d.]+) ms, ([\d.]+) ms voiced/.exec(measured ?? '') ?? [];
  expect(Number(durationMs)).toBeGreaterThanOrEqual(TAKE_SECONDS * 1000);
  expect(Number(voicedMs) / Number(durationMs)).toBeGreaterThan(0.9);

  // The response carries the key the upload minted and nothing else: a stored
  // recording's identity, never the recording.
  await expect(log(page).filter({ hasText: 'Read Aloud response' })).toContainText(
    '"key":"demo-take-',
  );
  await expect(log(page).filter({ hasText: 'recording-uploaded' })).toContainText('"takes":1');
  await expect(log(page).filter({ hasText: 'Read Aloud: scored' })).toContainText(
    'Read Aloud: scored 86% — passed',
  );
});
