/** BBB adds allow-same-origin only for a link outside BBB's own origin. */
export const BBB_WEBSITE_SHARE_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals allow-downloads';
export const BBB_WEBSITE_SHARE_ALLOW =
  'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write';
export function postEmbedResize(width: number, height: number): void {
  window.parent.postMessage({ type: 'lk-interactive-activity:resize', width, height }, '*');
}
