import { z } from 'zod/v4';

/**
 * Optional media attached to an activity (image / audio / video), rendered
 * above the question or passage — e.g. a recording to listen to before
 * answering. URL-only by design: hosting/delivery (S3/CDN) is the consuming
 * app's responsibility (see requirements "Non-Goals and Shared Responsibility").
 *
 * `alt` is REQUIRED for images (WCAG 1.1.1 / Req 14.5). For audio/video it is
 * an optional accessible label; `captionsUrl` points at a WebVTT track.
 */
export const MediaSchema = z
  .object({
    type: z.enum(['image', 'audio', 'video']),
    url: z.url(),
    alt: z.string().min(1).optional(),
    captionsUrl: z.url().optional(),
  })
  .refine((m) => m.type !== 'image' || (typeof m.alt === 'string' && m.alt.length > 0), {
    error: 'Image media requires non-empty alt text (WCAG 1.1.1).',
    path: ['alt'],
  });
