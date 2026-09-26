/**
 * Opens every story of the BUILT Storybook in Chromium and fails on any that
 * does not render: Storybook's own error screen, an error thrown on the page,
 * or an activity's error boundary ("could not be displayed").
 *
 * A build proves the stories compile; only rendering them proves their data is
 * valid and their components mount — which is what a story is for. Run after
 * `pnpm build-storybook`; CI runs it in the E2E job, whose browser it uses.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const STATIC = fileURLToPath(new URL('../storybook-static/', import.meta.url));
if (!existsSync(join(STATIC, 'index.json'))) {
  console.error(
    'storybook smoke: no storybook-static/index.json — run `pnpm build-storybook` first.',
  );
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt',
};
const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
  const file = join(STATIC, path === '/' || path === '\\' ? 'index.html' : path);
  if (!file.startsWith(STATIC) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const stories = Object.values(JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8')).entries)
  .filter((entry) => entry.type === 'story')
  .map((entry) => entry.id);

const failures = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  let thrown = [];
  page.on('pageerror', (error) => thrown.push(error.message));
  for (const id of stories) {
    thrown = [];
    await page.goto(`${base}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`);
    // Rendered, or failed: Storybook marks the body either way.
    await page.waitForFunction(
      () =>
        document.body.classList.contains('sb-show-main') ||
        document.body.classList.contains('sb-show-errordisplay'),
      undefined,
      { timeout: 20_000 },
    );
    // Give a play function its interactions.
    await page.waitForTimeout(300);
    if (await page.evaluate(() => document.body.classList.contains('sb-show-errordisplay'))) {
      const shown = (await page.locator('#error-message').textContent())?.trim();
      failures.push(`${id}: Storybook could not render it — ${shown || 'no message'}`);
      continue;
    }
    const boundary = await page
      .getByText(/could not be displayed|Activity failed to render/)
      .count();
    if (boundary > 0) {
      failures.push(`${id}: an activity's error boundary caught an error`);
    }
    for (const message of thrown) {
      failures.push(`${id}: threw ${message}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`storybook smoke FAILED:\n\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`storybook smoke OK: ${stories.length} stories render in Chromium.`);
