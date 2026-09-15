import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DictationData, evaluate } from '@intellectif/lk-core';
import { expect, type Page, test } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dictation } from '../dist/index.js';

/**
 * Marks in scripts other than Latin, measured in a real engine on the markup
 * `<Dictation>` itself renders (the built package, rendered on the server).
 *
 * Unit tests can see which spans exist; only a browser can see whether a
 * decoration is painted, and in which order a bidirectional algorithm lays
 * the characters out. Each case was run against the component without the
 * change it guards. The combining-mark, digit, Latin-in-Arabic and Central
 * Kurdish cases failed on the component as it was: a wrong combining mark had
 * a span of zero width, so its underline was never drawn; a missing
 * character's bullet — a neutral — split a number in right-to-left text; and
 * `ckb` was laid out left to right (its transcript starts with a Latin word,
 * so only the tag can make it right to left). The SARA AM, Sinhala, Kannada
 * and Khmer cases fail without their cluster rules, the descender case fails
 * when the underline skips ink, and the missing-space cases fail when a bullet
 * takes the direction of the character before it. The Arabic-letter bullet case
 * fails when every bullet is laid out left to right. The Gurmukhi, Tamil,
 * Chakma and Mongolian cases fail without their cluster rules where the
 * platform's fonts draw those letters into one glyph; the Tai Tham case fails
 * when common ligatures are turned off for every script, the ligature case
 * when they are turned off for none (where Calibri is installed); the shekel
 * and degree cases when a sign's bullet takes the content's direction, and the
 * same-direction case when a bullet between two runs of one direction takes
 * the content's. Each mark is checked on the wrong character's own box, so a
 * mark drawn somewhere else does not pass. The Latin and lam-alef cases are
 * controls: Chromium marks them either way.
 */
const THEME = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme');
const CSS = `${['defaults.css', 'skin.css'].map((file) => readFileSync(join(THEME, file), 'utf8')).join('\n')}
*, *::before, *::after { transition: none !important; animation: none !important; }
.lk-dc-word, .lk-dc-diff { font-size: 40px; }`;

const cp = (...points: number[]) => String.fromCodePoint(...points);

/** The review markup of `transcript` answered with `typed`. */
function reviewOf(transcript: string, typed: string, locale?: string): string {
  const data = {
    schemaVersion: '1.0',
    type: 'dictation',
    id: 'dc-scripts',
    title: 'Listen and type',
    transcript,
    ...(locale !== undefined ? { locale } : {}),
  } as DictationData;
  const value = { type: 'dictation', text: typed } as const;
  return renderToStaticMarkup(
    createElement(Dictation, {
      data,
      renderMode: 'review',
      defaultValue: value,
      outcome: evaluate(data, value),
    }),
  );
}

/** The characters `typed` has more of than `transcript`: what was typed wrong or in excess. */
function typedInExcess(transcript: string, typed: string): string[] {
  const counts = new Map<string, number>();
  for (const character of transcript) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  return [...typed].filter((character) => {
    const left = (counts.get(character) ?? 0) - 1;
    counts.set(character, left);
    return left < 0;
  });
}

async function show(page: Page, markup: string): Promise<void> {
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>${CSS}</style><main style="width: 900px">${markup}</main>`,
  );
}

test.describe('a wrong character drawn into another is still marked', () => {
  const CASES: [string, string, string][] = [
    [
      'a Thai tone mark typed wrong',
      cp(0xe44, 0xe21, 0xe48, 0x20, 0xe14, 0xe35),
      cp(0xe44, 0xe21, 0xe49, 0x20, 0xe14, 0xe35),
    ],
    [
      'a Thai tone mark typed where there is none',
      cp(0xe44, 0xe21, 0x20, 0xe14, 0xe35),
      cp(0xe44, 0xe21, 0xe48, 0x20, 0xe14, 0xe35),
    ],
    [
      'an Arabic vowel mark typed wrong',
      cp(0x643, 0x64e, 0x62a, 0x64e, 0x628, 0x64e),
      cp(0x643, 0x64e, 0x62a, 0x650, 0x628, 0x64e),
    ],
    [
      'a Hindi vowel sign typed wrong',
      cp(0x915, 0x93f, 0x924, 0x93e, 0x92c),
      cp(0x915, 0x940, 0x924, 0x93e, 0x92c),
    ],
    [
      'the alef of a lam-alef typed wrong',
      cp(0x633, 0x644, 0x627, 0x645),
      cp(0x633, 0x644, 0x623, 0x645),
    ],
    ['a Latin letter typed wrong (control)', 'kitten', 'kitxen'],
    [
      'a Thai SARA AM typed for a SARA AA',
      cp(0xe19, 0xe49, 0xe32, 0x20, 0xe14, 0xe35),
      cp(0xe19, 0xe49, 0xe33, 0x20, 0xe14, 0xe35),
    ],
    [
      'the letter of a Sinhala conjunct asked for with a joiner',
      cp(0xdc1, 0xdca, 0x200d, 0xdbb, 0xdd3, 0x20, 0xdbd),
      cp(0xdc1, 0xdca, 0x200d, 0xdbb, 0xdd2, 0x20, 0xdbd),
    ],
    [
      'a Kannada subjoined consonant typed wrong',
      cp(0xc85, 0xc95, 0xccd, 0xc95, 0x20, 0xca8),
      cp(0xc85, 0xc95, 0xccd, 0xc96, 0x20, 0xca8),
    ],
    [
      'a Khmer subscript consonant typed wrong',
      cp(0x179f, 0x17d2, 0x179a, 0x17b8, 0x20, 0x1780),
      cp(0x179f, 0x17d2, 0x179b, 0x17b8, 0x20, 0x1780),
    ],
    ['a Latin letter with a descender typed wrong', 'The quest begins', 'The guest begins'],
    [
      'a Gurmukhi letter set under the consonant before its virama',
      cp(0xa2a, 0xa4d, 0xa30, 0xa47, 0xa2e, 0x20, 0xa15),
      cp(0xa2a, 0xa4d, 0xa2f, 0xa47, 0xa2e, 0x20, 0xa15),
    ],
    [
      'a Tamil conjunct typed for its letters',
      cp(0xb95, 0xbcd, 0xb9a, 0x20, 0xb95),
      cp(0xb95, 0xbcd, 0xbb7, 0x20, 0xb95),
    ],
    [
      'a Chakma letter stacked under its virama',
      cp(0x11107, 0x11133, 0x11108, 0x20, 0x11107),
      cp(0x11107, 0x11133, 0x11109, 0x20, 0x11107),
    ],
    [
      'a Mongolian vowel separator typed where there is none',
      cp(0x1821, 0x182e, 0x1821, 0x20, 0x1820),
      cp(0x1821, 0x182e, 0x180e, 0x1821, 0x20, 0x1820),
    ],
  ];

  for (const forced of [false, true]) {
    test.describe(forced ? 'in forced colours' : 'in normal colours', () => {
      test.use({ contextOptions: { forcedColors: forced ? 'active' : 'none' } });

      for (const [label, transcript, typed] of CASES) {
        test(`${label}: its mark is painted, by shape and not by colour`, async ({ page }) => {
          const reset = async () => {
            await show(page, reviewOf(transcript, typed));
            // Colour pinned to the surrounding text, so only a decoration can differ.
            await page.addStyleTag({ content: '.lk-dc-op { color: inherit !important; }' });
          };
          await reset();
          for (const selector of [
            '.lk-dc-word[data-state="incorrect"] .lk-dc-word-text',
            '.lk-dc-diff',
          ]) {
            const wrong = page.locator(`${selector} .lk-dc-op:not([data-op="equal"])`);
            const count = await wrong.count();
            expect(count, `${selector} has a wrong character`).toBeGreaterThan(0);
            // The marks sit on what was typed wrong, not on a correct neighbour.
            const typedWrong = typedInExcess(transcript, typed);
            const markedText = (await wrong.allTextContents()).join('');
            expect(
              typedWrong.some((character) => markedText.includes(character)),
              `${selector} marks a character typed wrong`,
            ).toBe(true);
            for (let index = 0; index < count; index += 1) {
              // The wrong character's own box, with room for its decoration.
              const box = await wrong.nth(index).boundingBox();
              expect(
                box?.width ?? 0,
                `${selector} op ${index} has a width to be marked on`,
              ).toBeGreaterThan(0);
              const clip = {
                x: (box?.x ?? 0) - 2,
                y: (box?.y ?? 0) - 8,
                width: (box?.width ?? 0) + 4,
                height: (box?.height ?? 0) + 16,
              };
              const marked = await page.screenshot({ clip });
              await wrong.nth(index).evaluate((op) => op.setAttribute('data-op', 'equal'));
              const unmarked = await page.screenshot({ clip });
              expect(
                marked.equals(unmarked),
                `${selector} op ${index} shows the wrong character by its own mark`,
              ).toBe(false);
              await reset();
            }
          }
        });
      }
    });
  }
});

test.describe('a script that builds its letters from ligatures keeps them', () => {
  test('a correct Tai Tham conjunct is drawn in the diff as it is drawn anywhere else', async ({
    page,
  }) => {
    const conjunct = cp(0x1a20, 0x1a60, 0x1a26, 0x1a63);
    await show(page, reviewOf(`${conjunct} ${cp(0x1a20)}`, `${conjunct} ${cp(0x1a21)}`));
    const widths = await page.evaluate((word) => {
      const diff = document.querySelector('.lk-dc-diff') as HTMLElement;
      const op = [...diff.querySelectorAll('.lk-dc-op')].find((span) =>
        span.textContent?.includes(word),
      ) as HTMLElement;
      // The same text outside the component, in the same font and size.
      const probe = document.createElement('span');
      const style = getComputedStyle(diff);
      probe.style.font = `${style.fontSize} ${style.fontFamily}`;
      probe.textContent = word;
      document.body.append(probe);
      const range = document.createRange();
      const node = op.firstChild as Text;
      const start = (node.textContent ?? '').indexOf(word);
      range.setStart(node, start);
      range.setEnd(node, start + word.length);
      return [range.getBoundingClientRect().width, probe.getBoundingClientRect().width];
    }, conjunct);
    expect(Math.abs((widths[0] as number) - (widths[1] as number))).toBeLessThan(0.5);
  });

  test('a wrong letter inside a Latin font ligature still has its own mark', async ({ page }) => {
    await show(page, reviewOf('flow away', 'fiow away'));
    const hasCalibri = await page.evaluate(() => {
      const width = (family: string) => {
        const span = document.createElement('span');
        span.style.font = `40px ${family}`;
        span.textContent = 'mmmmwwwwiiii';
        document.body.append(span);
        const measured = span.getBoundingClientRect().width;
        span.remove();
        return measured;
      };
      return width('Calibri, monospace') !== width('monospace');
    });
    test.skip(!hasCalibri, 'Calibri, a font with an fi ligature, is not installed');
    await page.addStyleTag({ content: '.lk-dc { font-family: Calibri; }' });
    const box = await page.locator('.lk-dc-diff .lk-dc-op[data-op="substitute"]').boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
  });
});

/** The characters of `selector` matching `pattern`, in the order they are laid out, left to right. */
async function visualOrder(page: Page, selector: string, pattern: string): Promise<string> {
  return page.evaluate(
    ([within, source]) => {
      const matcher = new RegExp(source, 'u');
      const root = document.querySelector(within) as HTMLElement;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const found: { character: string; x: number }[] = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        let offset = 0;
        for (const character of text) {
          if (matcher.test(character)) {
            const range = document.createRange();
            range.setStart(node, offset);
            range.setEnd(node, offset + character.length);
            const box = range.getBoundingClientRect();
            found.push({ character, x: box.left + box.width / 2 });
          }
          offset += character.length;
        }
      }
      return found
        .sort((a, b) => a.x - b.x)
        .map((entry) => entry.character)
        .join('');
    },
    [selector, pattern] as const,
  );
}

test.describe('a missing character’s bullet keeps its place in right-to-left text', () => {
  const WRONG = '.lk-dc-word[data-state="incorrect"] .lk-dc-word-text';
  const LTR_RUN = '[0-9\\u0660-\\u0669a-z\\u2022]';

  for (const [label, locale, transcript, typed, expected] of [
    [
      'a digit missing from a year in Arabic',
      'ar',
      'ولد عام 2024 في القاهرة',
      'ولد عام 204 في القاهرة',
      '20•4',
    ],
    [
      'an Arabic-Indic digit missing',
      'ar',
      cp(0x661, 0x662, 0x663),
      cp(0x661, 0x663),
      `${cp(0x661)}•${cp(0x663)}`,
    ],
    ['a digit missing from a year in Hebrew', 'he', 'נולד ב 1990', 'נולד ב 190', '1•90'],
    [
      'a Latin letter missing at the end of a word in Arabic',
      'ar',
      'اشتريت iphone جديد',
      'اشتريت iphon جديد',
      'iphon•',
    ],
    [
      'a Latin letter missing at the start of a word in Arabic',
      'ar',
      'اشتريت iphone جديد',
      'اشتريت phone جديد',
      '•phone',
    ],
    [
      'a shekel sign missing before a number in Hebrew',
      'he',
      'המחיר ₪50 היום',
      'המחיר 50 היום',
      '•50',
    ],
    ['a degree sign missing after a number in Hebrew', 'he', 'חום 30° היום', 'חום 30 היום', '30•'],
  ] as const) {
    test(`${label}: laid out in reading order`, async ({ page }) => {
      await show(page, reviewOf(transcript, typed, locale));
      expect(await visualOrder(page, WRONG, LTR_RUN)).toBe(expected);
      expect(await visualOrder(page, '.lk-dc-diff', LTR_RUN)).toBe(expected);
    });
  }

  test('a space missing where a number meets an Arabic word sits between them', async ({
    page,
  }) => {
    await show(page, reviewOf('ولد عام 2024 في القاهرة', 'ولد عام 2024في القاهرة', 'ar'));
    const order = await visualOrder(page, '.lk-dc-diff', `[0-9\u2022\u0641\u064a]`);
    expect(order.replace(/[^0-9•]/gu, 'A')).toBe('AA•2024');
  });

  test('a space missing between a Latin word and a number in Arabic sits between them', async ({
    page,
  }) => {
    // Both neighbours run left to right, so the bullet does too, whatever the content's direction.
    await show(page, reviewOf('اشتريت iphone 15 جديد', 'اشتريت iphone15 جديد', 'ar'));
    expect(await visualOrder(page, '.lk-dc-diff', '[a-z0-9\u2022]')).toBe('iphone•15');
  });

  test('a space missing where an Arabic word meets an English one sits between them', async ({
    page,
  }) => {
    await show(page, reviewOf('I read كتاب today', 'I read كتابtoday', 'en'));
    const order = await visualOrder(page, '.lk-dc-diff', `[\u0600-\u06ff\u2022y]`);
    expect(order.replace(/[^•y]/gu, 'A')).toBe('AAAA•y');
  });

  test('an Arabic letter missing before a Latin word stays beside its own word', async ({
    page,
  }) => {
    // "كتاب iphone" typed without the final letter: in the right-to-left
    // sentence the bullet belongs at the left end of the Arabic word, between
    // it and the Latin word — not beyond the Latin word.
    await show(
      page,
      reviewOf(
        `${cp(0x643, 0x62a, 0x627, 0x628)} iphone`,
        `${cp(0x643, 0x62a, 0x627)} iphone`,
        'ar',
      ),
    );
    const order = await visualOrder(page, '.lk-dc-diff', `[a-z\\u2022\\u0600-\\u06ff]`);
    const bullet = order.indexOf('•');
    expect(order.slice(0, bullet)).toBe('iphone');
    expect(order.slice(bullet + 1)).toMatch(/^[؀-ۿ]+$/u);
  });
});

test('a Central Kurdish dictation lays its words out right to left', async ({ page }) => {
  // Starting with a Latin word, so the text alone would lay it out left to right.
  const sorani = `iPhone ${cp(
    0x645,
    0x646,
    0x20,
    0x62f,
    0x6d5,
    0x686,
    0x645,
    0x20,
    0x628,
    0x6c6,
    0x20,
    0x642,
    0x648,
    0x62a,
    0x627,
    0x628,
    0x62e,
    0x627,
    0x646,
    0x6d5,
  )}`;
  await show(page, reviewOf(sorani, `${sorani} x`, 'ckb'));
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('.lk-dc-word')].map((word) => {
      const { left, top, bottom } = word.getBoundingClientRect();
      return { left, top, bottom };
    }),
  );
  expect(boxes.length).toBeGreaterThan(2);
  // Right to left is leftwards along a line. Where the platform's fonts draw
  // the words wider than the box they wrap, and each line starts again at the
  // right edge, so a word on the next line is below, not to the left.
  let leftwards = 0;
  for (let index = 1; index < boxes.length; index += 1) {
    const before = boxes[index - 1] as (typeof boxes)[number];
    const word = boxes[index] as (typeof boxes)[number];
    if (word.top < before.bottom && before.top < word.bottom) {
      expect(word.left).toBeLessThan(before.left);
      leftwards += 1;
    } else {
      expect(word.top).toBeGreaterThanOrEqual(before.bottom);
    }
  }
  expect(leftwards).toBeGreaterThanOrEqual(2);
});
