import type { MediaTrack } from '@intellectif/lk-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Cue, parseWebVtt } from './vtt.js';

/*
 * The caption cues an interactive video draws: fetched or loaded once per
 * track, cached for the life of the player, and read by each caption line.
 */

/** A track as the cue cache knows it. */
export function trackKey(track: MediaTrack): string {
  return `${track.kind}:${track.srclang}:${track.src}`;
}

/** No cues, as one shared array: a line without any keeps one identity. */
export const NO_CUES: Cue[] = [];

/**
 * One caption line's cues: loaded when its track changes, and never another
 * track's. A late answer for a track the line has since left is dropped — a
 * slow Spanish file must never land in a line that now shows Portuguese — and
 * until the new track's cues arrive the line shows nothing rather than the old
 * language, unless they are cached already.
 */
export function useCaptionLine(
  track: MediaTrack | undefined,
  load: (track: MediaTrack) => Promise<Cue[]>,
  peek: (key: string) => Cue[] | undefined,
): { cues: Cue[]; failed: boolean } {
  const key = track === undefined ? undefined : trackKey(track);
  const [line, setLine] = useState<{ key?: string; cues: Cue[]; failed: boolean }>({
    cues: NO_CUES,
    failed: false,
  });
  const trackRef = useRef(track);
  trackRef.current = track;
  useEffect(() => {
    const wanted = trackRef.current;
    if (key === undefined || wanted === undefined) {
      return;
    }
    let live = true;
    load(wanted).then(
      (cues) => {
        if (live) {
          setLine({ key, cues, failed: false });
        }
      },
      () => {
        if (live) {
          setLine({ key, cues: NO_CUES, failed: true });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [key, load]);
  if (key === undefined) {
    return { cues: NO_CUES, failed: false };
  }
  if (line.key === key) {
    return line;
  }
  return { cues: peek(key) ?? NO_CUES, failed: false };
}

/**
 * Parsed cues per track, for the life of the mount: switching languages back
 * and forth never refetches. The promise while a file loads — so a swap, which
 * asks for a file both lines want, makes one request — and the cues once it
 * has. A failure is forgotten, so coming back to that language tries again.
 */
export function useCueLoader(
  captionsLoader: ((track: MediaTrack) => Promise<string>) | undefined,
): {
  loadCues: (track: MediaTrack) => Promise<Cue[]>;
  peekCues: (key: string) => Cue[] | undefined;
} {
  const loaderRef = useRef(captionsLoader);
  loaderRef.current = captionsLoader;
  const loading = useRef(new Map<string, Promise<Cue[]>>());
  const loaded = useRef(new Map<string, Cue[]>());
  const loadCues = useCallback((track: MediaTrack): Promise<Cue[]> => {
    const key = trackKey(track);
    const pending = loading.current.get(key);
    if (pending !== undefined) {
      return pending;
    }
    const request = Promise.resolve()
      .then(() =>
        loaderRef.current
          ? loaderRef.current(track)
          : fetch(track.src, { credentials: 'same-origin' }).then((response) => {
              if (!response.ok) {
                throw new Error(String(response.status));
              }
              return response.text();
            }),
      )
      .then((text) => {
        const parsed = parseWebVtt(text);
        if (parsed.length === 0) {
          throw new Error('The caption file held no cues.');
        }
        loaded.current.set(key, parsed);
        return parsed;
      });
    loading.current.set(key, request);
    request.catch(() => {
      loading.current.delete(key);
    });
    return request;
  }, []);
  const peekCues = useCallback((key: string) => loaded.current.get(key), []);
  return { loadCues, peekCues };
}
