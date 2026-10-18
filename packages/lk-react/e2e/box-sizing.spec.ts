import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * Boxes that fill their container, measured in a real engine.
 *
 * A box sized `width: 100%` that has padding or a border is wider than its
 * container unless it is `box-sizing: border-box`: the percentage sizes the
 * content box, and the padding and border go on outside it. A host page with a
 * global `* { box-sizing: border-box }` reset hides that; the example app has
 * none, and neither does every host. `.lk-mc`, `.lk-fib`, `.lk-dc`, `.lk-ra`,
 * `.lk-pf` and `.lk-iv` make everything they hold border-box. A written
 * response, a gap select and a stimulus panel do not, so a box in one of them
 * has to say so itself: the answer box ran 34 px past the form's edge, and
 * media 2 px past its frame. jsdom has no layout, so only a measurement shows
 * it.
 */
test("a written response's answer box is as wide as its form, in light and in dark", async ({
  page,
}) => {
  const backgrounds: string[] = [];
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    const answer = page.getByLabel('Feedback on writing', { exact: true }).getByRole('textbox');
    await expect(answer).toBeVisible();
    const box = await answer.evaluate((element) => {
      const own = element.getBoundingClientRect();
      const form = element.closest('.lk-wr')?.getBoundingClientRect();
      return {
        width: own.width,
        right: own.right,
        formWidth: form?.width ?? 0,
        formRight: form?.right ?? 0,
        background: getComputedStyle(element).backgroundColor,
      };
    });
    expect(box.formWidth).toBeGreaterThan(0);
    expect(box.width).toBeCloseTo(box.formWidth, 0);
    expect(box.right).toBeLessThanOrEqual(box.formRight + 0.5);
    backgrounds.push(box.background);
  }
  // `<ThemeProvider>` follows `prefers-color-scheme`. A page that stayed light
  // would measure the same box twice and prove nothing about the dark theme.
  expect(backgrounds[0]).not.toBe(backgrounds[1]);
});

const THEME = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme');
const CSS = ['defaults.css', 'skin.css']
  .map((file) => readFileSync(join(THEME, file), 'utf8'))
  .join('\n');

// Wider than any host below, so `max-width: 100%` is what sizes it.
const WIDE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400"/>',
)}`;

/** An image, and an embed in its 16:9 frame, as `<ActivityMedia>` renders them. */
const MEDIA = `
  <figure class="lk-media"><img class="lk-media-el" id="image" src="${WIDE_IMAGE}" alt=""></figure>
  <figure class="lk-media"><div class="lk-media-embed"><iframe class="lk-media-el" id="embed" title="Embedded media"></iframe></div></figure>
`;

/**
 * Every component that renders `<ActivityMedia>`, by the root it renders. The
 * example app shows media only in the first ones, which were never wrong, so
 * the media is set into each root here rather than looked for on the page.
 */
const HOSTS = [
  ['multiple choice', 'div', 'lk-mc'],
  ['fill in the blanks', 'form', 'lk-fib'],
  ['dictation', 'form', 'lk-dc'],
  ['read aloud', 'form', 'lk-ra'],
  ['gap select', 'form', 'lk-gs'],
  ['written response', 'form', 'lk-wr'],
  ['stimulus panel', 'section', 'lk-stimulus'],
] as const;

for (const [name, tag, root] of HOSTS) {
  test(`media in a ${name} stays inside its frame`, async ({ page }) => {
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>${CSS}</style><${tag} class="${root}" style="width: 600px">${MEDIA}</${tag}>`,
    );
    await page.locator('#image').evaluate((image) => (image as HTMLImageElement).decode());
    const boxes = await page.evaluate(() => {
      const measure = (id: string) => {
        const element = document.getElementById(id) as HTMLElement;
        const frame = (element.parentElement as HTMLElement).getBoundingClientRect();
        return { width: element.getBoundingClientRect().width, frame: frame.width };
      };
      return [measure('image'), measure('embed')];
    });
    for (const box of boxes) {
      expect(box.frame).toBeGreaterThan(0);
      expect(box.width).toBeCloseTo(box.frame, 0);
    }
  });
}
