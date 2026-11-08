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
