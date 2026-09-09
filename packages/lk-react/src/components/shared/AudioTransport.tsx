'use client';

import type {
  ActivityMedia as ActivityMediaData,
  MediaPlayClaim,
  ResolvedPlaybackPolicy,
} from '@intellectif/lk-core';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import type { LkStringsOverride } from '../../i18n/strings.js';
import type { MediaBudgetBinding, MediaTransportStrings } from '../types.js';

/**
 * The SDK's own audio player, used whenever a policy has something to enforce.
 *
 * The browser's control bar cannot express a spent budget — its play button
 * stays enabled — and a control that looks operable and does nothing is a
 * WCAG 3.2.2 / 4.1.3 failure, so an enforcing policy replaces the bar rather
 * than lying with it. What replaces it is a SUPERSET minus what the policy
 * removes on purpose: play/pause, elapsed and total time, mute, volume, an
 * optional speed control, an optional scrubber, and a live plays-remaining
 * status. Volume and mute are never restricted by any policy — they affect no
 * assessment property, and a learner in a lab with a locked OS volume has no
 * other lever once the native bar is gone.
 */

/** A resume is a start within a quarter-second of where playback last stopped. */
const RESUME_EPSILON = 0.25;
/** Below this, a seek is the browser settling rather than the learner moving. */
const SEEK_EPSILON = 0.35;
/** A charged play that errors before this much audio played produced nothing. */
const NO_PROGRESS = 0.25;

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

export interface AudioTransportProps {
  media: ActivityMediaData;
  policy: ResolvedPlaybackPolicy;
  renderMode?: 'practice' | 'exam' | 'review';
  disabled?: boolean;
  locale?: string;
  mediaBudget?: MediaBudgetBinding;
  mediaStrings?: Partial<MediaTransportStrings>;
  /** Overrides the SDK's chrome text. See {@link LkIntlProvider}. */
  strings?: LkStringsOverride;
  onInteraction?: (event: {
    type: string;
    activityId: string;
    timestamp: number;
    payload: Record<string, unknown>;
  }) => void;
}

export function AudioTransport({
  media,
  policy,
  renderMode = 'practice',
  disabled = false,
  locale,
  mediaBudget,
  mediaStrings,
  strings,
  onInteraction,
}: AudioTransportProps): React.JSX.Element {
  const elementRef = useRef<HTMLAudioElement>(null);
  const statusId = useId();

  // Provider first, then the narrower props that shipped in 0.8.0 — so an
  // existing `mediaStrings` call site still wins over a provider-wide default
  // and keeps behaving exactly as it did.
  const suppliedStrings = mediaBudget?.strings ?? mediaStrings;
  const fromProvider = useLkStrings(strings);
  const s: MediaTransportStrings = {
    ...fromProvider.media,
    ...mediaStrings,
    ...mediaBudget?.strings,
  };

  const enforced = mediaBudget?.enforced ?? renderMode !== 'review';
  const budgeted = enforced && policy.maxPlays !== null && mediaBudget !== undefined;
  const maxPlays = policy.maxPlays ?? 0;

  // Written synchronously inside handlers and mirrored into state for
  // rendering, for the same reason `ActivitySequence` keeps `outcomesRef` in a
  // ref: two events in one tick would otherwise both read the pre-update value.
  const usedRef = useRef(mediaBudget?.entry?.plays ?? 0);
  const pendingRef = useRef(false);
  const resumeAtRef = useRef<number | null>(null);
  const highWaterRef = useRef(0);
  const chargeRef = useRef<{ claim: MediaPlayClaim; at: number } | null>(null);
  const seededRef = useRef(false);
  const lastPositionRef = useRef(-1);
  // Marks a `play()` this component itself issued after charging. The element's
  // `play` event is where the budget is enforced — so that a media key or a
  // scripted `play()` is charged too — which means our OWN start re-enters it.
  // In the confirmed tier `pendingRef` covered that; in the optimistic tier
  // nothing did, and `remaining` is still the pre-charge value in that closure,
  // so a single press was charged twice.
  const selfStartRef = useRef(false);

  const [used, setUsed] = useState(usedRef.current);
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');
  // A repeated identical message must announce again, so the alert node is
  // REPLACED rather than mutated. Screen readers ignore an unchanged one.
  const [noticeNonce, setNoticeNonce] = useState(0);

  const remaining = Math.max(0, maxPlays - used);

  const announce = useCallback((message: string) => {
    setNotice(message);
    setNoticeNonce((n) => n + 1);
  }, []);

  const emit = useCallback(
    (type: string, playsUsed: number) => {
      if (!budgeted || mediaBudget === undefined || onInteraction === undefined) {
        return;
      }
      onInteraction({
        type,
        activityId: mediaBudget.activityId ?? mediaBudget.slotId,
        timestamp: Date.now(),
        payload: {
          mediaKey: mediaBudget.key,
          mediaType: 'audio',
          playsUsed,
          maxPlays,
          playsRemaining: Math.max(0, maxPlays - playsUsed),
        },
      });
    },
    [budgeted, mediaBudget, maxPlays, onInteraction],
  );

  const reportPosition = useCallback(
    (seconds: number) => {
      mediaBudget?.onPosition?.(mediaBudget.key, seconds);
    },
    [mediaBudget],
  );

  /** A start within a hair of where playback last stopped is a resume, not a play. */
  const isResume = useCallback((element: HTMLAudioElement): boolean => {
    const at = resumeAtRef.current;
    return at !== null && Math.abs(element.currentTime - at) < RESUME_EPSILON;
  }, []);

  const buildClaim = useCallback((): MediaPlayClaim | null => {
    if (mediaBudget === undefined) {
      return null;
    }
    return {
      key: mediaBudget.key,
      previousPlaysUsed: usedRef.current,
      playsUsed: usedRef.current + 1,
      maxPlays,
      playsRemaining: Math.max(0, maxPlays - (usedRef.current + 1)),
      slotId: mediaBudget.slotId,
      index: mediaBudget.index,
      ...(mediaBudget.activityId !== undefined ? { activityId: mediaBudget.activityId } : {}),
    };
  }, [mediaBudget, maxPlays]);

  const refuse = useCallback(() => {
    announce(s.noPlaysRemaining);
    emit('media-play-refused', usedRef.current);
  }, [announce, emit, s.noPlaysRemaining]);

  const startPlayback = useCallback(() => {
    const element = elementRef.current;
    if (element === null) {
      return;
    }
    highWaterRef.current = element.currentTime;
    selfStartRef.current = true;
    void element.play().catch(() => {
      selfStartRef.current = false;
      /* autoplay policies and races surface through the `error` handler */
    });
  }, []);

  const commit = useCallback(
    (claim: MediaPlayClaim) => {
      const element = elementRef.current;
      chargeRef.current = { claim, at: element?.currentTime ?? 0 };
      usedRef.current = claim.playsUsed;
      setUsed(claim.playsUsed);
      emit('media-play-consumed', claim.playsUsed);
    },
    [emit],
  );

  /**
   * Charges a play, then starts it.
   *
   * The confirmed tier holds playback until the consumer's atomic write
   * settles, which is the only construction that catches a second tab: two
   * mounts seeded at 0 both claim 1, and only the server can tell them apart.
   */
  const claimAndStart = useCallback(
    (element: HTMLAudioElement, alreadyPlaying: boolean) => {
      const claim = buildClaim();
      if (claim === null) {
        return;
      }
      const result = mediaBudget?.onPlayConsumed?.(claim);

      if (result !== undefined && typeof (result as Promise<unknown>).then === 'function') {
        if (alreadyPlaying) {
          element.pause();
        }
        pendingRef.current = true;
        setPending(true);
        void (result as Promise<{ playsUsed: number } | undefined>)
          .then((grant) => {
            const granted =
              grant !== undefined && Number.isInteger(grant.playsUsed)
                ? grant.playsUsed
                : claim.playsUsed;
            if (granted > maxPlays) {
              usedRef.current = granted;
              setUsed(granted);
              refuse();
              return;
            }
            commit({ ...claim, playsUsed: granted });
            startPlayback();
          })
          .catch(() => {
            // Nothing charged: the learner may retry.
            announce(s.playFailed);
            emit('media-play-errored', usedRef.current);
          })
          .finally(() => {
            pendingRef.current = false;
            setPending(false);
          });
        return;
      }

      commit(claim);
      if (!alreadyPlaying) {
        startPlayback();
      }
    },
    [
      buildClaim,
      mediaBudget,
      maxPlays,
      commit,
      startPlayback,
      refuse,
      announce,
      emit,
      s.playFailed,
    ],
  );

  const handleButton = useCallback(() => {
    const element = elementRef.current;
    if (element === null || pendingRef.current || disabled) {
      return;
    }
    if (!element.paused) {
      element.pause();
      return;
    }
    if (!budgeted || isResume(element)) {
      startPlayback();
      return;
    }
    if (remaining === 0) {
      refuse();
      return;
    }
    if (remaining === 1 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    claimAndStart(element, false);
  }, [disabled, budgeted, isResume, startPlayback, remaining, refuse, confirming, claimAndStart]);

  // Seed the restored position once metadata is known, BEFORE the seek guard
  // can see it — otherwise the guard reverts the very restore it was given.
  const handleLoadedMetadata = useCallback(() => {
    const element = elementRef.current;
    if (element === null) {
      return;
    }
    setDuration(Number.isFinite(element.duration) ? element.duration : 0);
    const at = mediaBudget?.entry?.at;
    if (!seededRef.current && typeof at === 'number' && Number.isFinite(at) && at > 0) {
      seededRef.current = true;
      highWaterRef.current = at;
      resumeAtRef.current = at;
      element.currentTime = at;
      setElapsed(at);
    }
  }, [mediaBudget]);

  /**
   * The budget lives on the ELEMENT's `play` event, not on the button, so a
   * hardware media key, a browser extension or a scripted `el.play()` is
   * charged too — and an exhausted budget stops playback inside the event,
   * before a sample is audible.
   */
  const handlePlay = useCallback(() => {
    const element = elementRef.current;
    if (element === null) {
      return;
    }
    if (disabled) {
      element.pause();
      return;
    }
    if (selfStartRef.current) {
      selfStartRef.current = false;
      setPlaying(true);
      return;
    }
    if (pendingRef.current) {
      setPlaying(true);
      return;
    }
    if (isResume(element)) {
      setPlaying(true);
      resumeAtRef.current = null;
      return;
    }
    if (!budgeted) {
      setPlaying(true);
      return;
    }
    if (remaining === 0) {
      element.pause();
      refuse();
      return;
    }
    setPlaying(true);
    claimAndStart(element, true);
  }, [disabled, isResume, budgeted, remaining, refuse, claimAndStart]);

  const handlePause = useCallback(() => {
    const element = elementRef.current;
    setPlaying(false);
    if (element === null) {
      return;
    }
    // Every pause records the position — learner, browser, or the pager's own
    // pause as a pane hides. Without this, paging through a six-question
    // listening group and back would exhaust the budget by navigation alone.
    resumeAtRef.current = element.currentTime;
    reportPosition(element.currentTime);
  }, [reportPosition]);

  const handleEnded = useCallback(() => {
    setPlaying(false);
    resumeAtRef.current = null;
    highWaterRef.current = 0;
    chargeRef.current = null;
    setElapsed(0);
    reportPosition(0);
  }, [reportPosition]);

  const handleTimeUpdate = useCallback(() => {
    const element = elementRef.current;
    if (element === null) {
      return;
    }
    setElapsed(element.currentTime);
    highWaterRef.current = Math.max(highWaterRef.current, element.currentTime);
    const whole = Math.floor(element.currentTime);
    if (whole !== lastPositionRef.current) {
      lastPositionRef.current = whole;
      reportPosition(element.currentTime);
    }
  }, [reportPosition]);

  const handleSeeking = useCallback(() => {
    const element = elementRef.current;
    if (element === null || policy.seek !== 'none') {
      return;
    }
    if (Math.abs(element.currentTime - highWaterRef.current) > SEEK_EPSILON) {
      element.currentTime = highWaterRef.current;
      announce(s.seekBlocked);
    }
  }, [policy.seek, announce, s.seekBlocked]);

  const handleRateChange = useCallback(() => {
    const element = elementRef.current;
    if (element === null || policy.rate !== 'fixed' || element.playbackRate === 1) {
      return;
    }
    element.playbackRate = 1;
    announce(s.rateBlocked);
  }, [policy.rate, announce, s.rateBlocked]);

  const handleError = useCallback(() => {
    const charge = chargeRef.current;
    const element = elementRef.current;
    // Ordering matters: an element can error with nothing charged (a bad URL
    // the learner never pressed play on), so the charge must be proven to
    // exist before its position is read.
    const progressed =
      charge !== null && element !== null && element.currentTime - charge.at >= NO_PROGRESS;
    if (charge !== null && !progressed) {
      if (mediaBudget?.onPlayRefunded !== undefined) {
        usedRef.current = charge.claim.previousPlaysUsed;
        setUsed(charge.claim.previousPlaysUsed);
        mediaBudget.onPlayRefunded(charge.claim);
        emit('media-play-refunded', charge.claim.previousPlaysUsed);
      } else {
        emit('media-play-errored', usedRef.current);
      }
    }
    chargeRef.current = null;
    setPlaying(false);
    announce(s.playFailed);
  }, [mediaBudget, emit, announce, s.playFailed]);

  // Keep the element's volume in step with the controls.
  useEffect(() => {
    const element = elementRef.current;
    if (element !== null) {
      element.volume = volume;
      element.muted = muted;
    }
  }, [volume, muted]);

  const exhausted = budgeted && remaining === 0;
  const buttonLabel = pending ? s.preparing : playing ? s.pause : s.play;

  return (
    <figure className="lk-media" data-controls="minimal">
      {/* biome-ignore lint/a11y/useMediaCaption: captions are optional in the data contract — a <track> is rendered when captionsUrl is provided; absence is the author's documented choice (Req 14.5) */}
      <audio
        ref={elementRef}
        className="lk-media-el"
        preload="metadata"
        aria-label={media.alt || undefined}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeeking}
        onRateChange={handleRateChange}
        onError={handleError}
      >
        <source src={media.url} />
        {media.captionsUrl ? <track kind="captions" src={media.captionsUrl} default /> : null}
      </audio>

      {/* A timeline runs with the audio, not with the script. Forcing LTR here
          fixes seek direction for RTL locales by construction; the surrounding
          text keeps the document direction. */}
      <div
        className="lk-media-transport"
        dir="ltr"
        {...(suppliedStrings !== undefined && locale !== undefined ? { lang: locale } : {})}
      >
        <button
          type="button"
          className="lk-media-play"
          onClick={handleButton}
          // NEVER `disabled`: a natively disabled button leaves the focus
          // order, so a learner who tabs into nothing is told nothing — and
          // disabling it mid-attempt would drop focus to <body>. Kept
          // focusable, it re-announces the refusal when pressed.
          aria-disabled={exhausted || disabled || undefined}
          aria-busy={pending || undefined}
          aria-label={exhausted ? `${s.play} — ${s.noPlaysRemaining}` : undefined}
          aria-describedby={budgeted ? statusId : undefined}
        >
          {buttonLabel}
        </button>

        <span className="lk-media-time">
          {formatTime(elapsed)} / {formatTime(duration)}
        </span>

        {policy.seek === 'allow' ? (
          <input
            type="range"
            className="lk-media-scrub"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(elapsed, duration || 0)}
            aria-label={s.seek}
            aria-valuetext={s.timeValue(formatTime(elapsed), formatTime(duration))}
            onChange={(event) => {
              const element = elementRef.current;
              if (element !== null) {
                element.currentTime = Number(event.target.value);
              }
            }}
          />
        ) : null}

        <button
          type="button"
          className="lk-media-mute"
          aria-pressed={muted}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? s.unmute : s.mute}
        </button>

        <input
          type="range"
          className="lk-media-volume"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label={s.volume}
          onChange={(event) => setVolume(Number(event.target.value))}
        />

        {policy.rate === 'allow' ? (
          <select
            className="lk-media-rate"
            aria-label={s.speed}
            defaultValue="1"
            onChange={(event) => {
              const element = elementRef.current;
              if (element !== null) {
                element.playbackRate = Number(event.target.value);
              }
            }}
          >
            {['0.75', '1', '1.25', '1.5'].map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {budgeted ? (
        <p className="lk-media-plays" id={statusId} role="status">
          {remaining > 0 ? s.playsRemaining(remaining, maxPlays) : s.noPlaysRemaining}
        </p>
      ) : null}

      {/* Separate from the polite status on purpose: a refusal is a direct
          response to a user action and must not be the update a screen reader
          drops when two polite regions compete. */}
      <p className="lk-media-notice" role="alert" key={noticeNonce}>
        {notice}
      </p>

      {confirming ? (
        <fieldset className="lk-media-confirm">
          <legend>{s.lastPlayConfirm}</legend>
          <button
            type="button"
            className="lk-media-confirm-start"
            // biome-ignore lint/a11y/noAutofocus: focus must land on the confirm action the press opened, or a keyboard learner is stranded on a button whose meaning just changed
            autoFocus
            onClick={() => {
              const element = elementRef.current;
              setConfirming(false);
              if (element !== null) {
                claimAndStart(element, false);
              }
            }}
          >
            {s.lastPlayStart}
          </button>
          <button
            type="button"
            className="lk-media-confirm-cancel"
            onClick={() => setConfirming(false)}
          >
            {s.lastPlayCancel}
          </button>
        </fieldset>
      ) : null}
    </figure>
  );
}
