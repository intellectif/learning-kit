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
/**
 * Media URL policy (security-reviewed): absolute URLs must use `https:`,
 * `http:`, `data:`, or `blob:`; root-relative paths (`/media/x.mp3`) are
 * allowed for same-origin hosting. Everything else — notably `javascript:`,
 * `file:`, `ftp:` — is rejected: these URLs land in `src` attributes
 * (including an iframe for `embed`), so an unvetted scheme is a stored-XSS
 * vector in every consuming app.
 */
export const MediaUrlSchema = z.union([
  z.url().refine((value) => /^(https?|data|blob):/i.test(value), {
    error: 'Absolute media URLs must use the https:, http:, data:, or blob: scheme.',
  }),
  z.string().regex(/^\/(?!\/)\S*$/, {
    error: 'Relative media URLs must be root-relative (a single leading "/").',
  }),
]);

export const MediaSchema = z
  .looseObject({
    type: z.enum(['image', 'audio', 'video', 'embed']),
    url: MediaUrlSchema,
    alt: z.string().min(1).optional(),
    captionsUrl: MediaUrlSchema.optional(),
  })
  .refine(
    (m) =>
      (m.type !== 'image' && m.type !== 'embed') || (typeof m.alt === 'string' && m.alt.length > 0),
    {
      error: 'image and embed media require non-empty alt text (WCAG 1.1.1 / 4.1.2).',
      path: ['alt'],
    },
  )
  .refine((m) => m.type !== 'embed' || /^https?:\/\//i.test(m.url), {
    error:
      'embed media requires an absolute http(s) provider URL. data:, blob:, and relative URLs are not allowed for embeds — the embed iframe runs with allow-scripts, and a data:/same-origin document there is an XSS vector.',
    path: ['url'],
  });
