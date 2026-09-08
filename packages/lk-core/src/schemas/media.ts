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

/**
 * Hints to the BROWSER'S OWN control bar, emitted as `controlsList` tokens.
 *
 * They remove a button, never a capability, and only in engines that implement
 * `controlsList` at all. `hide-download` does NOT prevent a download — the URL
 * is in the page and the bytes are in the network panel. If a recording must
 * not be kept, issue a short-lived signed URL; that is the consuming
 * application's control, not the SDK's.
 *
 * Meaningful only alongside the native bar: there is nothing to hint at once
 * the SDK owns the transport.
 */
export const NativeControlHintSchema = z.enum(['hide-download', 'hide-rate']);

/**
 * How an audio recording may be played.
 *
 * STRICT on purpose: an unknown key here is an authoring error. {@link
 * MediaSchema} is loose, so without this a typo one level down (`maxPlay`,
 * `seeking`) would be silently accepted and the whole policy would quietly do
 * nothing on an exam that believed it was enforced.
 *
 * Nothing here is required together with anything else — `{ maxPlays: 2 }` is a
 * complete, valid policy, because `controls` and `seek` RESOLVE to the only
 * values that can keep that promise. The refinements below reject only a
 * combination an author wrote **explicitly** that the renderer cannot honour.
 */
export const MediaPlaybackSchema = z.strictObject({
  /**
   * `native` (the resolved default) renders today's `<audio controls>`
   * unchanged. `minimal` — resolved automatically whenever any enforcement
   * field is set — replaces the browser bar with the SDK transport:
   * play/pause, elapsed/total, mute, volume, optional speed, optional
   * scrubber, and a live plays-remaining status.
   */
  controls: z.enum(['native', 'minimal']).optional(),
  /**
   * How many times the recording may be STARTED. A play is consumed when
   * playback begins from anywhere other than where it last stopped, so
   * pausing, resuming, and paging between the questions of one listening
   * group are all free. Enforced in `practice` and `exam`; never in `review`.
   */
  maxPlays: z.number().int().min(1).max(20).optional(),
  /** `none` renders no scrubber and reverts an out-of-band seek to the high-water mark. */
  seek: z.enum(['allow', 'none']).optional(),
  /** `fixed` renders no speed control and snaps `playbackRate` back to 1. */
  rate: z.enum(['allow', 'fixed']).optional(),
  /** Advisory only. See {@link NativeControlHintSchema}. */
  nativeControlHints: z.array(NativeControlHintSchema).min(1).max(2).optional(),
});

export const MediaSchema = z
  .looseObject({
    type: z.enum(['image', 'audio', 'video', 'embed']),
    url: MediaUrlSchema,
    alt: z.string().min(1).optional(),
    captionsUrl: MediaUrlSchema.optional(),
    playback: MediaPlaybackSchema.optional(),
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
  })
  .refine((m) => m.playback === undefined || m.type === 'audio', {
    error:
      'playback policy is supported on audio media only. An embed is a provider iframe the SDK cannot control at all (it has no reliable JS API for a third-party player); an image has nothing to play; video is deliberately deferred, because a video transport must also own fullscreen and Picture-in-Picture and the SDK will not pretend to govern those yet.',
    path: ['playback'],
  })
  .refine(
    (m) =>
      m.playback?.controls !== 'native' ||
      (m.playback.maxPlays === undefined &&
        m.playback.seek !== 'none' &&
        m.playback.rate !== 'fixed'),
    {
      error:
        'controls: "native" cannot carry maxPlays, seek: "none" or rate: "fixed". The browser\'s own bar keeps its play button enabled after a budget is spent, and keeps a scrubber that would move and then silently snap back — a control that looks operable and does nothing (WCAG 3.2.2 / 4.1.3). Omit `controls` and the SDK transport is used automatically, or use nativeControlHints for a cosmetic hint.',
      path: ['playback', 'controls'],
    },
  )
  .refine((m) => m.playback?.maxPlays === undefined || m.playback.seek !== 'allow', {
    error:
      'maxPlays cannot be combined with seek: "allow". A play is consumed when playback starts from somewhere other than where it stopped, so scrubbing back mid-play would replay the whole recording without spending anything. Omit `seek` — it resolves to "none" under a budget.',
    path: ['playback', 'seek'],
  })
  .refine(
    (m) =>
      m.playback?.controls !== 'minimal' ||
      m.playback.maxPlays !== undefined ||
      m.playback.seek === 'none' ||
      m.playback.rate === 'fixed',
    {
      error:
        'controls: "minimal" with nothing to enforce trades the browser\'s localized, familiar control bar for the SDK\'s, and buys nothing. Set maxPlays, seek: "none" or rate: "fixed", or omit `controls`.',
      path: ['playback', 'controls'],
    },
  )
  .refine(
    (m) =>
      m.playback?.nativeControlHints === undefined ||
      (m.playback.controls !== 'minimal' &&
        m.playback.maxPlays === undefined &&
        m.playback.seek !== 'none' &&
        m.playback.rate !== 'fixed'),
    {
      error:
        "nativeControlHints only affects the browser's own control bar, and an enforcing policy replaces that bar with the SDK transport — so the hints would be silently inert. Use them on an otherwise unrestricted recording, or drop them.",
      path: ['playback', 'nativeControlHints'],
    },
  );

/**
 * The strict counterpart of {@link MediaSchema}, for the redacted shapes.
 *
 * `RedactedActivityDataSchema` and `RedactedStimulusSchema` are `strictObject`
 * precisely so an unknown key is a validation failure rather than a
 * passthrough — but they embedded the LOOSE `MediaSchema`, so the strictness
 * stopped at the media boundary and `media.secretAnswerHint` passed
 * `assertRedacted`. This closes it.
 */
export const RedactedMediaSchema = z
  .strictObject({
    type: z.enum(['image', 'audio', 'video', 'embed']),
    url: MediaUrlSchema,
    alt: z.string().min(1).optional(),
    captionsUrl: MediaUrlSchema.optional(),
    playback: MediaPlaybackSchema.optional(),
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
