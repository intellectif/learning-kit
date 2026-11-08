import { expect, test } from '@playwright/test';
import { cineScrambleFixture } from '../src/__tests__/player-fixtures.js';
import { BBB_WEBSITE_SHARE_ALLOW, BBB_WEBSITE_SHARE_SANDBOX } from '../src/player/embed.js';
import { startOrder } from '../src/templates/cine-scramble/player/machine.js';

// The page never says which clip goes where; the test works it out as a learner's
// teacher would, from the activity itself.
const scramble = cineScrambleFixture();
const scene = scramble.scenes[0];
const order = scene ? startOrder(scene.clips, `${scramble.id}/${scene.id}`) : [];
const numberOf = (id: number) => order.findIndex((clip) => clip.id === id) + 1;

// The fixture's iframe is 850px tall: show all of it, as a classroom screen would.
test.use({ viewport: { width: 1280, height: 900 } });

for (const template of ['what-happens', 'cine-scramble']) {
  test(`${template} runs the real React player in the cross-origin BBB sandbox`, async ({
    page,
  }) => {
    await page.goto(`/?template=${template}`);
    const iframe = page.locator('iframe');
    await expect(iframe).toHaveAttribute(
      'sandbox',
      `${BBB_WEBSITE_SHARE_SANDBOX} allow-same-origin`,
    );
    await expect(iframe).toHaveAttribute('allow', BBB_WEBSITE_SHARE_ALLOW);
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('[data-lkia-root]')).toBeVisible();
    await expect(frame.getByRole('heading', { level: 1 })).toHaveText(
      template === 'what-happens' ? 'Garden predictions' : 'A garden sequence',
    );
    expect(new URL(page.url()).origin).not.toBe(
      new URL((await iframe.getAttribute('src')) || '').origin,
    );
    if (template === 'cine-scramble') {
      await frame.getByRole('button', { name: 'Start' }).click();
      await expect(frame.locator('[data-stage="arranging"]')).toBeVisible();
      await expect(frame.locator('[data-lkia-root]')).toBeFocused();
      // Intentionally missing fixture media settles into the real error fallback before dragging.
      await expect(frame.getByRole('alert')).toHaveCount(4);
      // Clip 1 is never the first clip, so dragging it to slot 1 is wrong; drag it
      // where it belongs instead: its chronological index.
      const draggedId = order[0]?.id ?? 0;
      const sourceClip = frame.locator(
        `[data-lkia-pool] [data-lkia-clip="${numberOf(draggedId)}"]`,
      );
      const source = await sourceClip.boundingBox();
      const destination = await frame.locator(`[data-lkia-slot="${draggedId}"]`).boundingBox();
      if (!source || !destination) throw new Error('Missing drag source or slot');
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        destination.x + destination.width / 2,
        destination.y + destination.height / 2,
        { steps: 10 },
      );
      await expect(frame.locator(`[data-lkia-slot="${draggedId}"]`)).toHaveAttribute(
        'data-drop-target',
        'true',
      );
      await page.mouse.up();
      await expect(
        frame.locator(`[data-lkia-slot="${draggedId}"] [data-lkia-clip="${numberOf(draggedId)}"]`),
      ).toBeVisible();
      for (let id = 0; id < 4; id += 1) {
        if (id === draggedId) continue;
        await frame.locator(`[data-lkia-clip="${numberOf(id)}"] [data-lkia-clip-button]`).focus();
        await page.keyboard.press(String(id + 1));
      }
      // Keyboard placement hands focus on: after the last clip, to Check.
      await expect(frame.getByRole('button', { name: 'Check', exact: true })).toBeFocused();
      await frame.getByRole('button', { name: 'Check', exact: true }).click();
      await expect(frame.locator('[data-stage="checked-correct"]')).toBeVisible();
      await expect(frame.locator('[data-lkia-row]')).toHaveCount(2);
    }
    await page.setViewportSize({ width: 400, height: 800 });
    await expect(frame.locator('[data-lkia-root]')).toHaveAttribute('data-lkia-layout', 'portrait');
  });
}
