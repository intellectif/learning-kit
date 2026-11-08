import { expect, it } from 'vitest';
import { BBB_WEBSITE_SHARE_ALLOW, BBB_WEBSITE_SHARE_SANDBOX } from '../contract/embed.js';

it('matches the Website Share plugin delegation without top navigation', () => {
  expect(BBB_WEBSITE_SHARE_SANDBOX).toBe(
    'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals allow-downloads',
  );
  expect(BBB_WEBSITE_SHARE_ALLOW).toBe(
    'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write',
  );
  expect(BBB_WEBSITE_SHARE_SANDBOX).not.toContain('allow-top-navigation');
  expect(BBB_WEBSITE_SHARE_SANDBOX).not.toContain('allow-same-origin');
});
