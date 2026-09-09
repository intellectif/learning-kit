import type { ActivityMedia as ActivityMediaData, InteractionEvent } from '@intellectif/lk-core';
import { resolvePlaybackPolicy } from '@intellectif/lk-core';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStringsOverride } from '../../i18n/strings.js';
import type { MediaBudgetBinding, MediaTransportStrings, RenderMode } from '../types.js';
import { AudioTransport } from './AudioTransport.js';

/**
 * Presentational media block shown above a question or passage. URL-only:
 * the SDK does not host media (consumer responsibility). Accessibility:
 * images use `alt` (schema requires it non-empty); audio/video expose an
 * optional label and a captions `<track>` when `captionsUrl` is provided;
 * `embed` renders a responsive sandboxed iframe with `alt` as its required
 * accessible `title` (Req 14.5).
 *
 * Audio additionally carries a playback policy (`media.playback`). With no
 * policy the emitted element is character-identical to what every release
 * before 0.8.0 produced; with something to enforce, the browser's control bar
 * is replaced by {@link AudioTransport}.
 */
export interface ActivityMediaProps {
  media: ActivityMediaData;
  renderMode?: RenderMode;
  disabled?: boolean;
  locale?: string;
  mediaBudget?: MediaBudgetBinding;
  mediaStrings?: Partial<MediaTransportStrings>;
  /** Overrides the SDK's chrome text. See {@link LkIntlProvider}. */
  strings?: LkStringsOverride;
  onInteraction?: (event: InteractionEvent) => void;
}

export function ActivityMedia(props: ActivityMediaProps): React.JSX.Element {
  const { media, renderMode = 'practice' } = props;
  // Read before the branches: every return below is conditional, and the one
  // string this component owns itself (the embed's accessible name) is on the
  // last of them.
  const s = useLkStrings(props.strings);

  if (media.type === 'image') {
    return (
      <figure className="lk-media">
        <img className="lk-media-el" src={media.url} alt={media.alt ?? ''} />
      </figure>
    );
  }

  if (media.type === 'audio') {
    const policy = resolvePlaybackPolicy(media);

    // BEFORE the branch below, not after it. A budgeted policy always resolves
    // to `controls: 'minimal'`, so a guard placed after that early return
    // could never fire for the one case it exists to catch — the transport
    // rendered happily with no binding, counting nothing, while the paper
    // believed it had a budget.
    if (policy.maxPlays !== null && renderMode === 'exam' && props.mediaBudget === undefined) {
      throw new Error(
        `ActivityMedia: audio ${JSON.stringify(media.url)} declares maxPlays and is rendered in ` +
          'renderMode "exam" without a `mediaBudget` binding. Nothing would persist the count, so ' +
          'a refresh restores the full budget while the page says plays remain. Render it through ' +
          '<ActivitySequence mediaBudget={…}> or pass `mediaBudget` yourself.',
      );
    }

    // REVIEW ALWAYS GETS THE NATIVE BAR. The paper is graded; a learner
    // reviewing it cannot change an answer by listening again, so taking away
    // their scrubber, their speed control and their browser-localized controls
    // buys nothing — and costs a learner with a processing disability the
    // ability to work out what they got wrong.
    if (policy.controls === 'minimal' && renderMode !== 'review') {
      return <AudioTransport {...props} media={media} policy={policy} />;
    }

    const hints = renderMode === 'review' ? [] : policy.nativeControlHints;
    return (
      <figure className="lk-media">
        {/* biome-ignore lint/a11y/useMediaCaption: captions are optional in the data contract — a <track> is rendered when captionsUrl is provided; absence is the author's documented choice (Req 14.5) */}
        <audio
          className="lk-media-el"
          controls
          aria-label={media.alt || undefined}
          {...(hints.length > 0
            ? {
                controlsList: hints
                  .map((hint) => (hint === 'hide-download' ? 'nodownload' : 'noplaybackrate'))
                  .join(' '),
              }
            : {})}
        >
          <source src={media.url} />
          {media.captionsUrl ? <track kind="captions" src={media.captionsUrl} default /> : null}
        </audio>
      </figure>
    );
  }

  if (media.type === 'embed') {
    return (
      <figure className="lk-media">
        <div className="lk-media-embed">
          <iframe
            className="lk-media-el"
            src={media.url}
            title={media.alt ?? s.embeddedMedia}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            // The docblock always promised a sandboxed iframe; now it is one.
            // allow-scripts + allow-same-origin are required by provider
            // players (YouTube/Vimeo); top-navigation, forms, downloads and
            // popups stay blocked. Scheme allow-listing in MediaSchema is the
            // primary defense; this is depth.
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </figure>
    );
  }

  return (
    <figure className="lk-media">
      {/* biome-ignore lint/a11y/useMediaCaption: captions are optional in the data contract — a <track> is rendered when captionsUrl is provided; absence is the author's documented choice (Req 14.5) */}
      <video className="lk-media-el" controls aria-label={media.alt || undefined}>
        <source src={media.url} />
        {media.captionsUrl ? <track kind="captions" src={media.captionsUrl} default /> : null}
      </video>
    </figure>
  );
}
