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
 *
 * **Each enforcement probe carries a CONTROL, on the same page and in the same
 * instant.** The first version of this file used a 44-byte WAV whose `data`
 * chunk was empty — zero seconds of audio. It ended the moment it started, so
 * `paused === true` and `currentTime === 0` held whether or not the mechanism
 * under test did anything: two probes passed for the wrong reason, and a third
 * raced the end-of-stream event and failed only in CI. A probe that cannot
 * fail proves nothing, so every mechanism is measured against an identical
 * element that does not have it.
 */

/** Two audio elements: `#control` has no mechanism, `#probe` gets one. */
const PAGE = `
  <!doctype html><meta charset="utf-8">
  <div id="pane">
    <audio id="control"></audio>
    <audio id="probe"></audio>
  </div>
  <script>
    /*
     * A real silent WAV, built here so the spec carries no multi-kilobyte
     * base64 literal. Ten seconds is long enough that nothing measured below
     * can be explained by the clip ending mid-measurement.
     */
    function silentWavUrl(seconds) {
      const rate = 8000, channels = 1, bits = 8;
      const frames = rate * seconds;
      const buffer = new ArrayBuffer(44 + frames);
      const view = new DataView(buffer);
      const ascii = (offset, text) => {
        for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
      };
      ascii(0, 'RIFF');  view.setUint32(4, 36 + frames, true);  ascii(8, 'WAVE');
      ascii(12, 'fmt '); view.setUint32(16, 16, true);          view.setUint16(20, 1, true);
      view.setUint16(22, channels, true);                        view.setUint32(24, rate, true);
      view.setUint32(28, (rate * channels * bits) / 8, true);
      view.setUint16(32, (channels * bits) / 8, true);           view.setUint16(34, bits, true);
      ascii(36, 'data'); view.setUint32(40, frames, true);
      new Uint8Array(buffer, 44).fill(128); // 8-bit PCM silence sits at 128
      return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    }

    const url = silentWavUrl(10);
    for (const el of document.querySelectorAll('audio')) {
      el.src = url;
      // Muted playback is exempt from every autoplay policy, so a CI runner
      // cannot turn "the mechanism failed" into "the browser refused to start".
      el.muted = true;
    }

    window.ready = Promise.all(
      [...document.querySelectorAll('audio')].map(
        (el) =>
          new Promise((resolve) => {
            if (el.readyState >= 1) resolve();
            else el.addEventListener('loadedmetadata', resolve, { once: true });
          }),
      ),
    );
  </script>
`;

test.describe('what the browser actually enforces', () => {
  test('pausing inside the play handler stops playback before audio is audible', async ({
    page,
  }) => {
    await page.setContent(PAGE);

    // The mechanism behind the SDK's one genuinely enforced control,
    // `maxPlays`: a `pause()` issued synchronously from the element's own
    // `play` event must stop playback before a sample is audible.
    const seen = await page.evaluate(async () => {
      await (window as unknown as { ready: Promise<unknown> }).ready;
      const control = document.getElementById('control') as HTMLAudioElement;
      const probe = document.getElementById('probe') as HTMLAudioElement;

      probe.addEventListener('play', () => probe.pause());

      const started = await Promise.all([
        control.play().then(
          () => true,
          () => false,
        ),
        probe.play().then(
          () => true,
          () => false,
        ),
      ]);
      await new Promise((r) => setTimeout(r, 300));

      return {
        blocked: started[0] === false,
        control: { paused: control.paused, currentTime: control.currentTime },
        probe: { paused: probe.paused, currentTime: probe.currentTime },
      };
    });

    test.skip(seen.blocked, 'autoplay blocked in this environment');

    // Control: the identical clip advances freely, so the probe below is
    // measuring the mechanism and not a clip that never played.
    expect(seen.control.paused, 'control: playback should be running').toBe(false);
    expect(seen.control.currentTime, 'control: the playhead should advance').toBeGreaterThan(0.05);

    expect(seen.probe.paused).toBe(true);
    expect(seen.probe.currentTime).toBeLessThan(0.25);
    expect(seen.probe.currentTime).toBeLessThan(seen.control.currentTime);
  });

  test('a seek can be reverted from the seeking event', async ({ page }) => {
    await page.setContent(PAGE);

    const seen = await page.evaluate(async () => {
      await (window as unknown as { ready: Promise<unknown> }).ready;
      const control = document.getElementById('control') as HTMLAudioElement;
      const probe = document.getElementById('probe') as HTMLAudioElement;

      const highWater = 0;
      probe.addEventListener('seeking', () => {
        if (Math.abs(probe.currentTime - highWater) > 0.35) probe.currentTime = highWater;
      });

      control.currentTime = 5;
      probe.currentTime = 5;
      await new Promise((r) => setTimeout(r, 150));

      return {
        duration: control.duration,
        control: control.currentTime,
        probe: probe.currentTime,
      };
    });

    // Control: a seek on this clip genuinely moves the playhead, so the revert
    // is a revert and not a clamp against a zero-length medium.
    expect(seen.duration).toBeGreaterThan(6);
    expect(seen.control, 'control: the seek should stick').toBeGreaterThan(4);

    expect(seen.probe).toBeLessThan(0.35);
  });

  test('playbackRate can be snapped back from the ratechange event', async ({ page }) => {
    await page.setContent(PAGE);

    const seen = await page.evaluate(async () => {
      const control = document.getElementById('control') as HTMLAudioElement;
      const probe = document.getElementById('probe') as HTMLAudioElement;

      probe.addEventListener('ratechange', () => {
        if (probe.playbackRate !== 1) probe.playbackRate = 1;
      });

      control.playbackRate = 2;
      probe.playbackRate = 2;
      await new Promise((r) => setTimeout(r, 50));

      return { control: control.playbackRate, probe: probe.playbackRate };
    });

    expect(seen.control, 'control: the rate is settable at all').toBe(2);
    expect(seen.probe).toBe(1);
  });
});

test.describe('what the browser only hints at', () => {
  test('controlsList is accepted as an attribute but removes no capability', async ({ page }) => {
    await page.setContent(PAGE);

    const result = await page.evaluate(() => {
      const el = document.getElementById('probe') as HTMLAudioElement;
      el.setAttribute('controls', '');
      el.setAttribute('controlsList', 'nodownload noplaybackrate');
      return {
        attribute: el.getAttribute('controlsList'),
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
    await page.setContent(PAGE);

    // The pager keeps every question mounted and toggles `hidden`, which is
    // display:none — and CSS does not touch playback. This is why the pager
    // pauses media imperatively as a pane hides, and why the docs say so.
    //
    // Measured by the playhead ADVANCING while hidden. `paused === false`
    // alone was the original mistake here: on a clip that ends during the
    // observation window it flips for a reason that has nothing to do with
    // `hidden`, which is exactly how this raced in CI.
    const seen = await page.evaluate(async () => {
      await (window as unknown as { ready: Promise<unknown> }).ready;
      const el = document.getElementById('probe') as HTMLAudioElement;
      const pane = document.getElementById('pane') as HTMLDivElement;

      const started = await el.play().then(
        () => true,
        () => false,
      );
      if (!started) return { blocked: true } as const;

      pane.hidden = true;
      const atHide = el.currentTime;
      await new Promise((r) => setTimeout(r, 300));

      return {
        blocked: false,
        atHide,
        after: el.currentTime,
        paused: el.paused,
        ended: el.ended,
        displayNone: getComputedStyle(el).display === 'none',
      } as const;
    });

    // `test.skip()` throws, so the early return is unreachable — but it is what
    // narrows the union for the compiler, which typechecks this directory.
    if (seen.blocked) {
      test.skip(true, 'autoplay blocked in this environment');
      return;
    }
    expect(seen.displayNone, 'the pane really is display:none').toBe(true);
    expect(seen.ended, 'the clip is long enough not to end mid-measurement').toBe(false);
    expect(seen.paused).toBe(false);
    expect(seen.after).toBeGreaterThan(seen.atHide);
  });
});
