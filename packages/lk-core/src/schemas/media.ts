import { z } from 'zod/v4';

/**
 * Optional media attached to an activity, rendered above the question or
 * passage — e.g. a recording to listen to, or an embedded video to watch
 * before answering. URL-only by design: hosting/delivery (S3/CDN, or the
 * provider's own embed for `embed`) is the consuming app's responsibility
 * (see requirements "Non-Goals and Shared Responsibility").
 *
 * - `image`: rendered as `<img>` — `alt` is REQUIRED (WCAG 1.1.1 / Req 14.5).
 * - `audio` / `video`: rendered with native controls; `alt` is an optional
 *   accessible label; `captionsUrl` points at a WebVTT `<track>`. `url` must
 *   be a direct media file (NOT a YouTube/Vimeo page — use `embed` for those).
 * - `embed`: rendered as a sandboxed `<iframe>` for provider players
 *   (YouTube/Vimeo/etc.). `url` MUST be the provider's *embeddable* URL
 *   (e.g. `https://www.youtube.com/embed/<id>`). `alt` is REQUIRED and used
 *   as the iframe's accessible `title` (WCAG 4.1.2 / 2.4.1).
 */
export const MediaSchema = z
  .object({
    type: z.enum(['image', 'audio', 'video', 'embed']),
    url: z.url(),
    alt: z.string().min(1).optional(),
    captionsUrl: z.url().optional(),
  })
  .refine(
    (m) =>
      (m.type !== 'image' && m.type !== 'embed') || (typeof m.alt === 'string' && m.alt.length > 0),
    {
      error: 'image and embed media require non-empty alt text (WCAG 1.1.1 / 4.1.2).',
      path: ['alt'],
    },
  );
