import type { ActivityMedia as ActivityMediaData } from '@intellectif/lk-core';

/**
 * Presentational media block shown above a question or passage. URL-only:
 * the SDK does not host media (consumer responsibility). Accessibility:
 * images use `alt` (schema requires it non-empty); audio/video expose an
 * optional label and a captions `<track>` when `captionsUrl` is provided;
 * `embed` renders a responsive sandboxed iframe with `alt` as its required
 * accessible `title` (Req 14.5).
 */
export function ActivityMedia({ media }: { media: ActivityMediaData }): React.JSX.Element {
  const { type, url, alt, captionsUrl } = media;

  if (type === 'image') {
    return (
      <figure className="lk-media">
        <img className="lk-media-el" src={url} alt={alt ?? ''} />
      </figure>
    );
  }

  if (type === 'audio') {
    return (
      <figure className="lk-media">
        {/* biome-ignore lint/a11y/useMediaCaption: captions are optional in the data contract — a <track> is rendered when captionsUrl is provided; absence is the author's documented choice (Req 14.5) */}
        <audio className="lk-media-el" controls aria-label={alt || undefined}>
          <source src={url} />
          {captionsUrl ? <track kind="captions" src={captionsUrl} default /> : null}
        </audio>
      </figure>
    );
  }

  if (type === 'embed') {
    return (
      <figure className="lk-media">
        <div className="lk-media-embed">
          <iframe
            className="lk-media-el"
            src={url}
            title={alt ?? 'Embedded media'}
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
      <video className="lk-media-el" controls aria-label={alt || undefined}>
        <source src={url} />
        {captionsUrl ? <track kind="captions" src={captionsUrl} default /> : null}
      </video>
    </figure>
  );
}
