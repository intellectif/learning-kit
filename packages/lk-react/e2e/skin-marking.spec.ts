import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * The skin's post-submit marking, checked by COMPUTED STYLE in a real engine.
 *
 * Unit tests assert class names and `data-*` attributes; none of them can see
 * which rule actually wins. That gap hid a specificity bug for several
 * releases: `:has(input:checked)` is (0,2,1) and `[data-correct="true"]` is
 * (0,2,0), so the option a learner picked *and got right* kept the selection
 * colour instead of turning green — the single most reassuring state in the
 * component was the one that did not mark. Source order cannot fix that, which
 * is exactly why a colour-level test is worth its cost.
 */
const THEME = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme');
const SHEETS = ['defaults.css', 'skin.css']
  .map((file) => readFileSync(join(THEME, file), 'utf8'))
  .join('\n');

// The skin animates `border-color`, so a computed value read straight after a
// hover is sampled mid-transition and reports a blend of the two colours.
const CSS = `${SHEETS}
*, *::before, *::after { transition: none !important; animation: none !important; }`;

/** A marked question exactly as `<MultipleChoice>` renders it after submit. */
const MARKED = `
  <fieldset class="lk-mc" disabled>
    <label class="lk-mc-option" id="right-checked" data-correct="true">
      <input type="radio" name="a" checked disabled><span>Correct and chosen</span>
    </label>
    <label class="lk-mc-option" id="right-unchecked" data-correct="true">
      <input type="radio" name="b" disabled><span>Correct, not chosen</span>
    </label>
    <label class="lk-mc-option" id="wrong-checked" data-correct="false">
      <input type="radio" name="c" checked disabled><span>Wrong and chosen</span>
    </label>
    <label class="lk-mc-option" id="neutral" data-correct="false">
      <input type="radio" name="d" disabled><span>Neutral distractor</span>
    </label>
  </fieldset>
`;

async function borderColours(page: import('@playwright/test').Page) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${MARKED}`);
  return page.evaluate(() => {
    const read = (id: string) =>
      getComputedStyle(document.getElementById(id) as HTMLElement).borderTopColor;
    const token = (name: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return {
      tokens: {
        primary: token('--lk-color-primary'),
        success: token('--lk-color-success'),
        error: token('--lk-color-error'),
      },
      rightChecked: read('right-checked'),
      rightUnchecked: read('right-unchecked'),
      wrongChecked: read('wrong-checked'),
      neutral: read('neutral'),
    };
  });
}

/** `#rrggbb` → `rgb(r, g, b)`, which is what a computed style reports. */
const toRgb = (hex: string): string => {
  const v = hex.replace('#', '').trim();
  const full =
    v.length === 3
      ? v
          .split('')
          .map((c) => c + c)
          .join('')
      : v;
  const n = Number.parseInt(full, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

test.describe('post-submit marking colours', () => {
  test('a correct AND chosen option marks as success, not as selected', async ({ page }) => {
    const seen = await borderColours(page);
    const success = toRgb(seen.tokens.success);
    const primary = toRgb(seen.tokens.primary);

    expect(seen.rightChecked).toBe(success);
    expect(seen.rightChecked).not.toBe(primary);
  });

  test('a correct but unchosen option also marks as success', async ({ page }) => {
    const seen = await borderColours(page);
    expect(seen.rightUnchecked).toBe(toRgb(seen.tokens.success));
  });

  test('a wrong AND chosen option marks as error', async ({ page }) => {
    const seen = await borderColours(page);
    expect(seen.wrongChecked).toBe(toRgb(seen.tokens.error));
  });

  test('hovering a marked option does not repaint it in the selection colour', async ({ page }) => {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${MARKED}`);

    // After submit the pointer often lands on an option simply because the
    // layout shifted when the Submit button disappeared. Showing the selection
    // affordance there tells the learner a marked, disabled option is still
    // selectable.
    const probe = async (id: string) => {
      await page.hover(`#${id}`);
      return page.evaluate(
        (target) => getComputedStyle(document.getElementById(target) as HTMLElement).borderTopColor,
        id,
      );
    };

    const primary = await page.evaluate(() => {
      const hex = getComputedStyle(document.documentElement)
        .getPropertyValue('--lk-color-primary')
        .trim()
        .replace('#', '');
      const full =
        hex.length === 3
          ? hex
              .split('')
              .map((c) => c + c)
              .join('')
          : hex;
      const n = Number.parseInt(full, 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    });

    expect(await probe('neutral')).not.toBe(primary);
    expect(await probe('right-checked')).not.toBe(primary);
    expect(await probe('wrong-checked')).not.toBe(primary);
  });

  test('an unmarked option still shows the hover affordance', async ({ page }) => {
    await page.setContent(`
      <!doctype html><meta charset="utf-8"><style>${CSS}</style>
      <fieldset class="lk-mc">
        <label class="lk-mc-option" id="live"><input type="radio" name="a"><span>Pick me</span></label>
      </fieldset>
    `);
    await page.hover('#live');
    const { border, primary } = await page.evaluate(() => {
      const hex = getComputedStyle(document.documentElement)
        .getPropertyValue('--lk-color-primary')
        .trim()
        .replace('#', '');
      const full =
        hex.length === 3
          ? hex
              .split('')
              .map((c) => c + c)
              .join('')
          : hex;
      const n = Number.parseInt(full, 16);
      return {
        border: getComputedStyle(document.getElementById('live') as HTMLElement).borderTopColor,
        primary: `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`,
      };
    });
    expect(border).toBe(primary);
  });
});

test.describe('dictation word marks', () => {
  /**
   * A marked word list as `<Dictation>` renders it after submit: a wrong word
   * rebuilt from stored details is plain text; a wrong word the component
   * compared itself is drawn as its character marks.
   */
  const WORDS = `
    <form class="lk-dc">
      <ol class="lk-dc-words">
        <li class="lk-dc-word" data-state="correct" id="correct"><span class="lk-dc-word-text" aria-hidden="true">cat</span></li>
        <li class="lk-dc-word" data-state="incorrect" id="incorrect"><span class="lk-dc-word-text" aria-hidden="true">cta</span></li>
        <li class="lk-dc-word" data-state="incorrect" id="incorrect-marked"><span class="lk-dc-word-text" aria-hidden="true" data-marks="characters"><span class="lk-dc-op" data-op="equal">c</span><span class="lk-dc-op" data-op="substitute">t</span><span class="lk-dc-op" data-op="equal">a</span></span></li>
        <li class="lk-dc-word" data-state="missing" id="missing"><span class="lk-dc-word-text" aria-hidden="true">sat</span></li>
        <li class="lk-dc-word" data-state="extra" id="extra"><span class="lk-dc-word-text" aria-hidden="true">now</span></li>
      </ol>
    </form>
  `;

  test('each state has its own colour, decoration and glyph, so none is colour alone', async ({
    page,
  }) => {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${WORDS}`);
    const seen = await page.evaluate(() => {
      const token = (name: string) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const read = (id: string) => {
        const text = document.querySelector(`#${id} .lk-dc-word-text`) as HTMLElement;
        const cs = getComputedStyle(text);
        return {
          color: cs.color,
          decoration: cs.textDecorationLine,
          style: cs.textDecorationStyle,
          outline: cs.outlineStyle,
          glyph: getComputedStyle(text, '::before').content,
        };
      };
      return {
        tokens: { success: token('--lk-color-success'), error: token('--lk-color-error') },
        // Drawn as its character marks, a wrong word carries no underline of
        // its own, so the substituted character's is the only one.
        marked: {
          word: getComputedStyle(
            document.querySelector('#incorrect-marked .lk-dc-word-text') as HTMLElement,
          ).textDecorationLine,
          ops: [...document.querySelectorAll('#incorrect-marked .lk-dc-op')].map((op) => {
            const cs = getComputedStyle(op);
            return `${cs.display}/${cs.textDecorationLine}/${cs.textDecorationStyle}`;
          }),
        },
        correct: read('correct'),
        incorrect: read('incorrect'),
        missing: read('missing'),
        extra: read('extra'),
      };
    });

    expect(seen.correct.color).toBe(toRgb(seen.tokens.success));
    expect(seen.correct.decoration).toBe('none');
    expect(seen.correct.glyph).toContain('✓');

    expect(seen.incorrect.decoration).toContain('underline');
    expect(seen.incorrect.style).toBe('wavy');
    expect(seen.incorrect.glyph).toContain('✗');
    expect(seen.marked.word).toBe('none');
    expect(seen.marked.ops).toEqual([
      'inline/none/solid',
      'inline/underline/wavy',
      'inline/none/solid',
    ]);

    expect(seen.missing.outline).toBe('dotted');
    expect(seen.missing.glyph).toContain('∅');

    expect(seen.extra.decoration).toContain('line-through');
    expect(seen.extra.glyph).toContain('+');

    // Four states, four distinct decoration signatures.
    const signatures = new Set(
      [seen.correct, seen.incorrect, seen.missing, seen.extra].map(
        (state) => `${state.decoration}/${state.style}/${state.outline}/${state.glyph}`,
      ),
    );
    expect(signatures.size).toBe(4);
  });

  /**
   * Computed style cannot show what is painted — a decoration an inline-block
   * blocks still reads as "underline" — so this compares pixels: each mark with
   * and without decorations, in the band where an underline is drawn.
   */
  test('a wrong character is drawn with its own mark, and the right ones beside it with none', async ({
    page,
  }) => {
    await page.setContent(
      // On the words themselves: `.lk-dc-word` sets its own size, so an
      // enlargement on the form would never reach the characters measured.
      `<!doctype html><meta charset="utf-8"><style>${CSS} .lk-dc-word { font-size: 48px; }</style>${WORDS}`,
    );
    const band = async (selector: string) => {
      const box = await page.locator(selector).first().boundingBox();
      if (box === null) {
        throw new Error(`${selector} has no box`);
      }
      // Clear of the neighbouring characters, and deep enough for the underline.
      return { x: box.x + 3, y: box.y, width: Math.max(1, box.width - 6), height: box.height + 24 };
    };
    const right = await band('#incorrect-marked .lk-dc-op[data-op="equal"]');
    const wrong = await band('#incorrect-marked .lk-dc-op[data-op="substitute"]');
    const before = {
      right: await page.screenshot({ clip: right }),
      wrong: await page.screenshot({ clip: wrong }),
    };
    await page.addStyleTag({
      content: '.lk-dc-word-text, .lk-dc-op { text-decoration: none !important; }',
    });
    const after = {
      right: await page.screenshot({ clip: right }),
      wrong: await page.screenshot({ clip: wrong }),
    };
    expect(before.wrong.equals(after.wrong), 'the wrong character is underlined').toBe(false);
    expect(before.right.equals(after.right), 'a right character carries no underline').toBe(true);
  });
});

test.describe('option layout on a narrow screen', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('option text sits beside the radio, and is not crushed by a wide sibling', async ({
    page,
  }) => {
    // Consumers commonly set `flex-wrap: wrap` so a per-option feedback note can
    // drop below the row. In a WRAPPING flex container an item wraps before it
    // shrinks, so a text span with no flex contract moves to its own line —
    // leaving the radio alone on the line above.
    await page.setContent(`
      <!doctype html><meta charset="utf-8"><style>${CSS}</style>
      <style>.lk-mc-option { flex-wrap: wrap; }</style>
      <fieldset class="lk-mc">
        <label class="lk-mc-option" id="long">
          <input type="radio" name="a">
          <span>A reasonably long answer option that has to share the row</span>
        </label>
        <label class="lk-mc-option" id="withmark" data-correct="false">
          <input type="radio" name="b" checked>
          <span>Another fairly long option sharing its row</span>
          <span class="lk-mc-option-feedback" style="width:155px">Not quite — try again</span>
        </label>
      </fieldset>
    `);

    const boxes = await page.evaluate(() => {
      const rect = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      };
      return {
        radio: rect('#long input'),
        text: rect('#long span'),
        crushedText: rect('#withmark span'),
      };
    });

    // The text starts to the right of the radio rather than below it. A pixel
    // threshold on `top` is fragile across font metrics; overlap is not.
    expect(boxes.text.left).toBeGreaterThan(boxes.radio.left);
    expect(boxes.text.top).toBeLessThan(boxes.radio.top + boxes.radio.height);
    // A wide sibling must push itself onto the next line rather than crush the
    // text into a one-character-per-line column.
    expect(boxes.crushedText.width).toBeGreaterThan(80);
    expect(boxes.crushedText.height).toBeLessThan(120);
  });
});

test.describe('chosen versus missed: weight, not hue', () => {
  // Both correct states are the same green on purpose; what must differ is
  // fill and border style, so "you got it" and "the key was here" never read
  // as the same thing. Pinned by computed style because the earlier
  // specificity bug proved a class-name test cannot see which rule wins.
  async function marks(page: import('@playwright/test').Page) {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${CSS}</style>${MARKED}`);
    return page.evaluate(() => {
      const read = (id: string) => {
        const el = document.getElementById(id) as HTMLElement;
        const cs = getComputedStyle(el);
        return {
          borderStyle: cs.borderTopStyle,
          background: cs.backgroundColor,
          opacity: cs.opacity,
          glyph: getComputedStyle(el, '::after').content,
        };
      };
      return {
        surface: getComputedStyle(document.documentElement)
          .getPropertyValue('--lk-color-surface')
          .trim(),
        rightChecked: read('right-checked'),
        rightUnchecked: read('right-unchecked'),
        wrongChecked: read('wrong-checked'),
        neutral: read('neutral'),
      };
    });
  }

  test('a correct answer the learner missed is outlined, not filled', async ({ page }) => {
    const m = await marks(page);
    expect(m.rightUnchecked.borderStyle).toBe('dashed');
    expect(m.rightUnchecked.background).toBe(toRgb(m.surface));
    expect(m.rightUnchecked.glyph).toContain('○');
  });

  test('a correct AND chosen answer is solid and tinted', async ({ page }) => {
    const m = await marks(page);
    expect(m.rightChecked.borderStyle).toBe('solid');
    expect(m.rightChecked.background).not.toBe(toRgb(m.surface));
    expect(m.rightChecked.glyph).toContain('✓');
  });

  test('a wrong AND chosen answer is solid, tinted, and crossed', async ({ page }) => {
    const m = await marks(page);
    expect(m.wrongChecked.borderStyle).toBe('solid');
    expect(m.wrongChecked.background).not.toBe(toRgb(m.surface));
    expect(m.wrongChecked.glyph).toContain('✗');
  });

  test('an untouched distractor recedes but stays readable', async ({ page }) => {
    const m = await marks(page);
    // 0.7 is the AA-verified figure; anything lower must be re-checked.
    expect(m.neutral.opacity).toBe('0.7');
    expect(m.neutral.glyph).toBe('none');
  });
});
