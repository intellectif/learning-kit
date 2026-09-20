'use client';

import type { TimelineChapter } from '@intellectif/lk-core';
import { useCallback, useRef, useState } from 'react';
import type { LkStrings } from '../../i18n/strings.js';
import { clock } from './format.js';
import { type Cue, cueIndexAt } from './vtt.js';

/** How a quiz's marker is drawn. Never by colour alone: each state has its own shape. */
export type MarkerState =
  | 'unreached'
  | 'open'
  | 'answered'
  | 'correct'
  | 'partial'
  | 'incorrect'
  | 'pending';

export interface ScrubberMarker {
  id: string;
  at: number;
  label: string;
  state: MarkerState;
  required: boolean;
}

interface ScrubberProps {
  current: number;
  duration: number;
  buffered: number;
  chapters: readonly TimelineChapter[];
  markers: readonly ScrubberMarker[];
  cues: readonly Cue[];
  /** No caption past this point shows in the preview (the no-skip-ahead spoiler rule). */
  previewLimit: number;
  strings: LkStrings;
  onSeek: (seconds: number) => void;
  onScrubChange: (scrubbing: boolean) => void;
}

interface Hover {
  x: number;
  width: number;
  time: number;
}

/** Half the widest the bubble may grow, in px: keeps it inside the track at the ends. */
const BUBBLE_HALF = 120;
/** How near the pointer must be to a marker, in px, for the bubble to name its quiz. */
const MARKER_REACH = 8;

/**
 * The progress bar.
 *
 * A thin line at rest and a thicker one under the pointer — the line, not the
 * control, is what should be visible — over a generous hit strip, so a thin bar
 * is still easy to grab. Pointer events with capture, so a drag that leaves the
 * bar keeps scrubbing. It is one slider for assistive technology; its markers
 * are drawn, not focusable, and a keyboard learner reaches quizzes through
 * `[` / `]` and the contents panel instead.
 */
export function Scrubber({
  current,
  duration,
  buffered,
  chapters,
  markers,
  cues,
  previewLimit,
  strings,
  onSeek,
  onScrubChange,
}: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [dragging, setDragging] = useState(false);
  const ready = duration > 0;
  const percent = (value: number): string =>
    `${ready ? Math.min(100, Math.max(0, (value / duration) * 100)) : 0}%`;

  const measure = useCallback(
    (clientX: number): Hover | null => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (rect === undefined || rect.width === 0 || !ready) {
        return null;
      }
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return { x: ratio * rect.width, width: rect.width, time: ratio * duration };
    },
    [duration, ready],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const at = measure(event.clientX);
    if (at === null) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onScrubChange(true);
    setHover(at);
    onSeek(at.time);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const at = measure(event.clientX);
    if (at === null) {
      return;
    }
    setHover(at);
    if (dragging) {
      onSeek(at.time);
    }
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    onScrubChange(false);
  };

  // Handled here and not allowed to bubble: the player has its own arrow keys,
  // and letting both run would move the playhead twice per press.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!ready) {
      return;
    }
    const step = event.shiftKey ? 1 : 5;
    const moves: Record<string, number> = {
      ArrowLeft: -step,
      ArrowRight: step,
      ArrowDown: -step,
      ArrowUp: step,
      PageDown: -30,
      PageUp: 30,
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      onSeek(current + move);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      onSeek(event.key === 'Home' ? 0 : duration);
    }
  };

  const chapterAt = (time: number): TimelineChapter | undefined =>
    [...chapters].reverse().find((chapter) => chapter.at <= time);
  const hoverCue =
    hover !== null && hover.time <= previewLimit ? cues[cueIndexAt(cues, hover.time)] : undefined;
  const hoverMarker =
    hover === null
      ? undefined
      : markers.find(
          (marker) => Math.abs((marker.at / duration) * hover.width - hover.x) <= MARKER_REACH,
        );
  const hoverChapter = hover === null ? undefined : chapterAt(hover.time);
  const bubbleLeft =
    hover === null
      ? 0
      : hover.width > BUBBLE_HALF * 2
        ? Math.min(hover.width - BUBBLE_HALF, Math.max(BUBBLE_HALF, hover.x))
        : hover.width / 2;
  const currentChapter = chapterAt(current);

  return (
    <div
      ref={trackRef}
      className="lk-iv-scrubber"
      role="slider"
      tabIndex={ready ? 0 : -1}
      aria-label={strings.media.seek}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      aria-valuetext={
        currentChapter === undefined
          ? strings.media.timeValue(clock(current), clock(duration))
          : `${strings.media.timeValue(clock(current), clock(duration))}, ${currentChapter.title}`
      }
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (!dragging) {
          setHover(null);
        }
      }}
      onKeyDown={onKeyDown}
    >
      <div className="lk-iv-scrubber-track" aria-hidden="true">
        <div className="lk-iv-scrubber-buffered" style={{ width: percent(buffered) }} />
        <div className="lk-iv-scrubber-played" style={{ width: percent(current) }} />
        {chapters
          .filter((chapter) => chapter.at > 0 && chapter.at < duration)
          .map((chapter) => (
            <span
              key={`chapter-${chapter.at}`}
              className="lk-iv-scrubber-gap"
              style={{ insetInlineStart: percent(chapter.at) }}
            />
          ))}
      </div>
      <div
        className="lk-iv-scrubber-thumb"
        aria-hidden="true"
        style={{ insetInlineStart: percent(current) }}
      />
      {markers.map((marker) => (
        <span
          key={marker.id}
          className="lk-iv-marker"
          data-state={marker.state}
          data-required={marker.required || undefined}
          aria-hidden="true"
          style={{ insetInlineStart: percent(Math.min(marker.at, duration)) }}
        />
      ))}
      {hover !== null ? (
        <div
          className="lk-iv-bubble"
          aria-hidden="true"
          style={{ insetInlineStart: `${bubbleLeft}px` }}
        >
          <span className="lk-iv-bubble-time">
            {clock(hover.time)}
            {hoverChapter !== undefined ? (
              <span className="lk-iv-bubble-chapter"> · {hoverChapter.title}</span>
            ) : null}
          </span>
          {hoverMarker !== undefined ? (
            <span className="lk-iv-bubble-quiz">{hoverMarker.label}</span>
          ) : null}
          {hoverCue !== undefined ? (
            <span className="lk-iv-bubble-caption">{hoverCue.text}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
