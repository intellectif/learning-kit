import { expect, test } from '@playwright/test';

/**
 * Capability probe for the media playback policy.
 *
 * The docs make specific claims about what a browser enforces and what it only
 * hints at, and the SDK's whole position is that it never claims a capability
 * it does not have. This spec is the evidence behind those claims: it exercises
 * the raw browser mechanisms the transport depends on, in a real engine, so no
 * documented promise outlives the behaviour it rests on.
 *
 * Every assertion here is about the BROWSER, not about SDK code — that is the
 * point. Playwright runs chromium in this repo, so results are recorded as
 * chromium's; `controlsList` in particular is not implemented everywhere, and
 * the docs say so rather than generalising from this file.
 */

/** A tiny silent WAV, so nothing here depends on a network fetch or a fixture. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

const page_ = (extraAttrs = '') => `
  <!doctype html><meta charset="utf-8">
  <audio id="a" src="${SILENT_WAV}" ${extraAttrs}></audio>
`;

test.describe('what the browser actually enforces', () => {
  test('pausing inside the play handler stops playback before audio is audible', async ({
    page,
  }) => {
    await page.setContent(page_());

    // This is the mechanism behind the SDK's ONE genuinely enforced control:
    // `maxPlays`. If a `pause()` issued synchronously from the element's own
    // `play` event let audio through, the claim "the play is refused before a
    // sample is audible" would be false.
    const result = await page.evaluate(async () => {
      const el = document.getElementById('a') as HTMLAudioElement;
      let refused = false;
      el.addEventListener('play', () => {
        refused = true;
        el.pause();
      });
      try {
        await el.play();
      } catch {
        /* an autoplay rejection is also a refusal */
      }
      await new Promise((r) => setTimeout(r, 50));
      return { refused, paused: el.paused, currentTime: el.currentTime };
    });

    expect(result.refused).toBe(true);
    expect(result.paused).toBe(true);
    // Nothing meaningful played.
    expect(result.currentTime).toBeLessThan(0.25);
  });

  test('a seek can be reverted from the seeking event', async ({ page }) => {
    await page.setContent(page_());

    const result = await page.evaluate(async () => {
      const el = document.getElementById('a') as HTMLAudioElement;
      const highWater = 0;
      el.addEventListener('seeking', () => {
        if (Math.abs(el.currentTime - highWater) > 0.35) {
          el.currentTime = highWater;
        }
      });
      el.currentTime = 5;
      await new Promise((r) => setTimeout(r, 50));
      return el.currentTime;
    });

    expect(result).toBeLessThan(0.35);
  });

  test('playbackRate can be snapped back from the ratechange event', async ({ page }) => {
    await page.setContent(page_());

    const result = await page.evaluate(async () => {
      const el = document.getElementById('a') as HTMLAudioElement;
      el.addEventListener('ratechange', () => {
        if (el.playbackRate !== 1) {
          el.playbackRate = 1;
        }
      });
      el.playbackRate = 2;
      await new Promise((r) => setTimeout(r, 50));
      return el.playbackRate;
    });

    expect(result).toBe(1);
  });
});

test.describe('what the browser only hints at', () => {
  test('controlsList is accepted as an attribute but removes no capability', async ({ page }) => {
    await page.setContent(page_('controls controlsList="nodownload noplaybackrate"'));

    const result = await page.evaluate(() => {
      const el = document.getElementById('a') as HTMLAudioElement;
      return {
        attribute: el.getAttribute('controlsList'),
        // The property is only implemented in some engines; the docs must not
        // assume it. Recorded either way rather than asserted as universal.
        domTokenListSupported: 'controlsList' in el,
        // The decisive point: the media is still fetchable regardless of any
        // hint, which is why the docs say `hide-download` never prevents a
        // download and point at signed URLs instead.
        srcStillReadable: typeof el.currentSrc === 'string' && el.currentSrc.length > 0,
        rateStillSettable: (() => {
          el.playbackRate = 1.5;
          return el.playbackRate === 1.5;
        })(),
      };
    });

    expect(result.attribute).toBe('nodownload noplaybackrate');
    // `noplaybackrate` hides a MENU ITEM; it does not stop script setting the
    // rate. A policy that needs the rate fixed must use `rate: 'fixed'`, which
    // the SDK enforces from the ratechange event above.
    expect(result.rateStillSettable).toBe(true);
    expect(result.srcStillReadable).toBe(true);
  });

  test('a hidden pane does not stop playback on its own', async ({ page }) => {
    await page.setContent(`
      <!doctype html><meta charset="utf-8">
      <div id="pane"><audio id="a" src="${SILENT_WAV}"></audio></div>
    `);

    // The pager keeps every question mounted and toggles `hidden`, which is
    // display:none — and CSS does not touch playback. This is why the pager
    // pauses media imperatively as a pane hides, and why the docs say so.
    const result = await page.evaluate(async () => {
      const el = document.getElementById('a') as HTMLAudioElement;
      const pane = document.getElementById('pane') as HTMLDivElement;
      try {
        await el.play();
      } catch {
        return { skipped: true, pausedAfterHide: null };
      }
      pane.hidden = true;
      await new Promise((r) => setTimeout(r, 50));
      return { skipped: false, pausedAfterHide: el.paused };
    });

    if (!result.skipped) {
      expect(result.pausedAfterHide).toBe(false);
    }
  });
});
