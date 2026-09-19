'use client';

import { useCallback, useState } from 'react';

/**
 * Whether the page refused to play the learner's own take, and the handler
 * every element that plays it reports a refusal through.
 *
 * The take is played from a `blob:` URL — the preview of a take not yet sent —
 * or from a link a review minted, and a page can refuse either without a word:
 * a Content-Security-Policy whose `media-src` does not allow `blob:` blocks the
 * load, the element fires `error`, and every control that plays it goes on
 * looking as if it works. So the refusal is decided in one place, by the URL
 * that was refused: a new take is a new URL and starts out playable again, and
 * a refusal an element reports after it was handed another URL cannot mark the
 * new one.
 *
 * `refuse` takes the element, not the URL, and reads the address the element
 * is loading at the moment it fails: an `error` belongs to the source the
 * element holds when it fires, and a closure's URL may already be a render
 * behind it.
 */
export function usePlaybackRefusal(url: string | null | undefined): {
  refused: boolean;
  refuse: (element: HTMLMediaElement) => void;
} {
  const [refusedUrl, setRefusedUrl] = useState<string | null>(null);
  const refuse = useCallback((element: HTMLMediaElement) => {
    const source = element.getAttribute('src');
    if (source !== null) {
      setRefusedUrl(source);
    }
  }, []);
  return { refused: url !== null && url !== undefined && url === refusedUrl, refuse };
}

/**
 * Whether a rejected `play()` is the page refusing the source, rather than an
 * autoplay policy refusing the gesture. Only the first is the take's to report:
 * an autoplay refusal says nothing about whether the take can be played.
 */
export function isSourceRefusal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'NotSupportedError'
  );
}
