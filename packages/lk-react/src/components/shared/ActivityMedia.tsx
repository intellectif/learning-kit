import type { ActivityMedia as ActivityMediaData } from '@intellectif/lk-core';

/**
 * Presentational media block shown above a question or passage. URL-only:
 * the SDK does not host media (consumer responsibility). Accessibility:
 * images use `alt` (schema requires it to be non-empty); audio/video expose
 * an optional accessible label and render a captions `<track>` when the
 * activity provides `captionsUrl` (Req 14.5).
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
