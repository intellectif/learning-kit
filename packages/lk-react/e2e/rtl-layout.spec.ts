import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * The skin under `dir="rtl"`, checked by measured geometry in a real engine.
 *
 * `<LkIntlProvider>` sets `dir` on its wrapper, so from 0.9.0 the skin renders
 * in both directions. A stylesheet can carry a physical `margin-left` or `left`
 * for years without anyone noticing: in LTR it is correct, and until now no
 * test in this repo rendered RTL at all. Four such declarations put the
 * per-blank feedback's gap and the blank's tooltip on the wrong side in RTL —
 * the affordance ends up on the opposite edge from the thing it describes.
 *
 * Logical properties (`margin-inline-start`, `inset-inline-start`) are the fix,
 * and geometry is the only test that can see whether they were used: a class
 * name cannot distinguish `margin-left` from `margin-inline-start`, and neither
 * can a computed style read in the default direction.
 *
 * **Each assertion here was checked against the physical property it replaced**
 * — reinstating `margin-left` / `left` fails the matching test. An RTL test that
 * measures a box positioned by something else (the option row's text span has
 * `flex: 1 1 0%`, which end-aligns everything after it in both directions with
 * or without an auto margin) proves nothing, so those are not asserted here.
 */
const THEME = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme');
const SHEETS = ['defaults.css', 'skin.css']
  .map((file) => readFileSync(join(THEME, file), 'utf8'))
  .join('\n');

const CSS = `${SHEETS}
*, *::before, *::after { transition: none !important; animation: none !important; }`;

// No whitespace between the input and the note: an inline space of its own
// would sit on the same side in both directions and mask the margin.
const BLANK_FEEDBACK = `
  <p class="lk-fib-passage" style="width: 600px"><span class="lk-fib-blank"><input type="text" id="input" value="Paris"></span><span class="lk-fib-blank-feedback" id="note" data-correct="true">Capital</span></p>
`;

/** A blank with its live tooltip open, as `<FillInTheBlanks>` renders it. */
const TOOLTIP = `
  <p class="lk-fib-passage" style="width: 600px">
    <span class="lk-fib-blank" id="blank" style="position: relative">
      <input type="text" value="Paris">
      <span aria-live="polite" id="tip">Correct</span>
    </span>
  </p>
`;

async function boxes(page: import('@playwright/test').Page, dir: 'ltr' | 'rtl', body: string) {
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div dir="${dir}">${body}</div>`,
  );
  return page.evaluate(() => {
    const rect = (id: string) => {
      const r = (document.getElementById(id) as HTMLElement).getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
    };
    const ids = ['input', 'note', 'blank', 'tip'].filter((id) => document.getElementById(id));
    return Object.fromEntries(ids.map((id) => [id, rect(id)])) as Record<
      string,
      { left: number; right: number; width: number }
    >;
  });
}

test.describe('the skin follows the writing direction', () => {
  test("per-blank feedback keeps its gap on the blank's side", async ({ page }) => {
    // `margin-inline-start` puts the gap between the input and the note in
    // both directions. A physical `margin-left` puts it on the note's outer
    // edge in RTL, so the note butts against the input it belongs to and is
    // spaced away from the next word instead.
    const ltr = await boxes(page, 'ltr', BLANK_FEEDBACK);
    const ltrGap = ltr.note.left - ltr.input.right;
    expect(ltrGap).toBeGreaterThan(2);
    expect(ltrGap).toBeLessThan(20);

    const rtl = await boxes(page, 'rtl', BLANK_FEEDBACK);
    const rtlGap = rtl.input.left - rtl.note.right;
    expect(rtlGap).toBeGreaterThan(2);
    expect(rtlGap).toBeLessThan(20);
  });

  test("a blank's tooltip is anchored to the edge the text starts from", async ({ page }) => {
    const ltr = await boxes(page, 'ltr', TOOLTIP);
    expect(Math.abs(ltr.tip.left - ltr.blank.left)).toBeLessThan(4);

    const rtl = await boxes(page, 'rtl', TOOLTIP);
    expect(Math.abs(rtl.tip.right - rtl.blank.right)).toBeLessThan(4);
  });
});
