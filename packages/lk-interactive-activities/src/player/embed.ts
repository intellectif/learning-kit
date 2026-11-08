/** BBB adds allow-same-origin only for a link outside BBB's own origin. */
export const BBB_WEBSITE_SHARE_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals allow-downloads';
export const BBB_WEBSITE_SHARE_ALLOW =
  'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write';

/**
 * Tells the parent window the player's rendered size, so an embedding page can
 * size its iframe to the content. A receiving page must check `event.source`
 * and `event.origin`; the message carries no learner data.
 */
export function postEmbedResize(width: number, height: number): void {
  window.parent.postMessage(
    { type: 'lk-interactive-activity:resize', width: Math.ceil(width), height: Math.ceil(height) },
    '*',
  );
}
