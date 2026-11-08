import type { CSSProperties, JSX, KeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../../player/icons.js';
import {
  chromeLocaleFor,
  definedOnly,
  fillTemplate,
  hasCommandModifier,
  isTypingTarget,
  keyShortcuts,
  languageAttributes,
} from '../../../player/locale.js';
import { resolveAssetUrl } from '../../../player/resolve-url.js';
import { Stage } from '../../../player/Stage.js';
import type { PlayerHostOptions } from '../../../player/types.js';
import { whatHappensChrome } from '../copy.js';
import { isSupportsEnabled } from '../rules.js';
import type { WhatHappensData } from '../types.js';
import { answerSegments } from './answer-text.js';
import { listenToAnswer } from './listen.js';
import {
  clampPlaybackTime,
  nextWhatHappensStage,
  reachesFreeze,
  type WhatHappensAction,
  type WhatHappensStage,
} from './machine.js';

export interface WhatHappensPlayerProps extends PlayerHostOptions {
  activity: WhatHappensData;
}

const DEFAULT_FRAME_INTERVAL = 1 / 30;

/** Board columns for a clip count: one row up to four, then four, then six. */
export function boardColumns(count: number): number {
  if (count <= 4) return Math.max(1, count);
  return count <= 8 ? 4 : 6;
}

/** A frame early in the clip, for a card with no thumbnail: never past the freeze. */
function previewUrl(url: string, freezeAt: number): string {
  if (url.includes('#')) return url;
  return `${url}#t=${(freezeAt / 2).toFixed(2)}`;
}

/** What identifies the activity a player shows: a new one starts the player afresh. */
function identityOf(activity: WhatHappensData): string {
  return [activity.id, ...(activity.clips ?? []).map((clip) => clip.id)].join('\u0000');
}

/**
 * The What Happens player: a board of clips; each plays to its freeze point,
 * asks its question, reveals the rest, asks the learner to tell it, then shows
 * and speaks the sample answer. Never graded.
 */
export function WhatHappensPlayer(props: WhatHappensPlayerProps): JSX.Element {
  // A different activity, or a different set of clips, starts from the board.
  return <WhatHappensView key={identityOf(props.activity)} {...props} />;
}

function WhatHappensView({ activity, ...host }: WhatHappensPlayerProps): JSX.Element {
  // Built-in chrome < host strings < the editor's own copy for this activity.
  const chrome = {
    ...whatHappensChrome(host.locale),
    ...definedOnly(host.strings),
    ...definedOnly(activity.copy),
  };
  const chromeLocale = chromeLocaleFor(host.locale, host.strings);
  const content = languageAttributes(activity.locale);
  const shortcuts = host.shortcuts !== false;
  const [stage, setStage] = useState<WhatHappensStage>('board');
  const [clipIndex, setClipIndex] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const [listenError, setListenError] = useState(false);
  const [ended, setEnded] = useState(false);
  const [progress, setProgress] = useState(0);
  // The supports start hidden on every clip: the teacher shows them when the class needs them.
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const live = useRef(true);
  const listenGeneration = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const frozen = useRef(false);
  const clip = activity.clips[clipIndex] ?? activity.clips[0];
  const answerText = clip?.answer?.text ?? '';
  const hasAnswer = answerText.trim() !== '';
  const move = (action: WhatHappensAction) => {
    setStage((previous) => nextWhatHappensStage(previous, action));
    setListenError(false);
  };
  const emit = (
    type: 'clip.opened' | 'clip.frozen' | 'clip.revealed' | 'answer.shown' | 'clip.completed',
  ) => {
    host.onEvent?.({ type, activityId: activity.id, clipId: clip.id });
  };
  // Stops only what this player started: its recording, or its own utterance.
  const stopListening = () => {
    listenGeneration.current += 1;
    audio.current?.pause();
    const speech = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (utterance.current && speech && (speech.speaking || speech.pending)) speech.cancel();
    utterance.current = null;
  };
  const stopRef = useRef(stopListening);
  stopRef.current = stopListening;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      stopRef.current();
    };
  }, []);

  const freezeNow = () => {
    const element = video.current;
    if (!element || frozen.current) return;
    frozen.current = true;
    element.pause();
    // A clip that ends before its freeze point freezes on its last frame.
    const end =
      Number.isFinite(element.duration) && element.duration > 0 ? element.duration : clip.freezeAt;
    element.currentTime = Math.min(clip.freezeAt, end);
    setProgress(1);
    emit('clip.frozen');
    move('freeze');
  };
  const freezeRef = useRef(freezeNow);
  freezeRef.current = freezeNow;

  const clipId = clip.id;
  const freezeAt = clip.freezeAt;
  // Start (or restart) playback when a stage that plays begins. Keyed on the
  // clip's id and freeze point, not the clip object, so a host re-render with
  // fresh data does not restart the video.
  // biome-ignore lint/correctness/useExhaustiveDependencies: clipId restarts playback when another clip opens.
  useEffect(() => {
    if (stage !== 'watch' && stage !== 'reveal') return;
    const element = video.current;
    if (!element) return;
    if (stage === 'watch') {
      frozen.current = false;
      setProgress(0);
    }
    setEnded(false);
    element.currentTime = stage === 'watch' ? 0 : freezeAt;
    setBlocked(false);
    let active = true;
    void element.play().catch(() => {
      if (active) setBlocked(true);
    });
    return () => {
      active = false;
      element.pause();
    };
  }, [stage, clipId, freezeAt]);

  // Frame-accurate freeze: check every presented frame (or every animation
  // frame while playing) and stop one frame before the freeze point, so no frame
  // after it is ever shown. `timeupdate` and `ended` are backstops.
  // biome-ignore lint/correctness/useExhaustiveDependencies: clipId restarts the frame watch when another clip opens.
  useEffect(() => {
    if (stage !== 'watch') return;
    const element = video.current;
    if (!element) return;
    let cancelled = false;
    let handle = 0;
    let last = -1;
    let interval = DEFAULT_FRAME_INTERVAL;
    const reached = (mediaTime: number) => {
      if (last >= 0 && mediaTime > last)
        interval = Math.min(0.1, Math.max(1 / 120, mediaTime - last));
      last = mediaTime;
      if (element.paused || !reachesFreeze(mediaTime, interval, freezeAt)) return false;
      freezeRef.current();
      return true;
    };
    // Not every browser (nor jsdom) has requestVideoFrameCallback yet.
    const byFrame =
      typeof element.requestVideoFrameCallback === 'function'
        ? element.requestVideoFrameCallback.bind(element)
        : undefined;
    if (byFrame) {
      const onFrame = (_now: number, metadata: { mediaTime: number }) => {
        if (!cancelled && !reached(metadata.mediaTime)) handle = byFrame(onFrame);
      };
      handle = byFrame(onFrame);
      return () => {
        cancelled = true;
        element.cancelVideoFrameCallback(handle);
      };
    }
    // Without frame callbacks, poll on animation frames, but only while playing.
    const onAnimationFrame = () => {
      handle = 0;
      if (cancelled || reached(element.currentTime) || element.paused) return;
      handle = requestAnimationFrame(onAnimationFrame);
    };
    const start = () => {
      if (!cancelled && handle === 0) handle = requestAnimationFrame(onAnimationFrame);
    };
    element.addEventListener('play', start);
    start();
    return () => {
      cancelled = true;
      element.removeEventListener('play', start);
      cancelAnimationFrame(handle);
    };
  }, [stage, clipId, freezeAt]);

  // The fallback Play button takes focus when it appears, if the player has it.
  useEffect(() => {
    if (!blocked) return;
    const active = document.activeElement;
    const root = playButton.current?.closest('[data-lkia-root]');
    if (root && (active === document.body || active === null || root.contains(active))) {
      playButton.current?.focus({ preventScroll: true });
    }
  }, [blocked]);

  const play = () => {
    setBlocked(false);
    void video.current?.play().catch(() => {
      if (live.current) setBlocked(true);
    });
  };
  const open = (index: number) => {
    const item = activity.clips[index];
    if (!item) return;
    setClipIndex(index);
    setError(false);
    setBlocked(false);
    setHelpOpen(false);
    move('open');
    host.onEvent?.({ type: 'clip.opened', activityId: activity.id, clipId: item.id });
  };
  const back = () => {
    if (stage === 'board') return;
    stopListening();
    video.current?.pause();
    move('back');
  };
  const reveal = () => {
    if (stage === 'guess') {
      emit('clip.revealed');
      move('reveal');
    }
  };
  const showAnswer = () => {
    if (stage === 'tell' && hasAnswer) {
      emit('answer.shown');
      move('answer');
    }
  };
  const listen = async () => {
    if (!audio.current || !hasAnswer) return;
    stopListening();
    setListenError(false);
    const generation = listenGeneration.current;
    const isActive = () => live.current && generation === listenGeneration.current;
    try {
      const via = await listenToAnswer(clip, audio.current, host.resolveUrl, {
        isActive,
        ...(content.lang !== undefined ? { lang: content.lang } : {}),
        onUtterance: (spoken) => {
          utterance.current = spoken;
        },
        onSpeechError: () => {
          if (isActive()) setListenError(true);
        },
      });
      if (via && isActive())
        host.onEvent?.({ type: 'audio.played', activityId: activity.id, clipId: clip.id, via });
    } catch {
      if (isActive()) setListenError(true);
    }
  };
  const next = () => {
    if (stage !== 'answer' && !(stage === 'tell' && !hasAnswer)) return;
    stopListening();
    emit('clip.completed');
    const done = completed.includes(clip.id) ? completed : [...completed, clip.id];
    setCompleted(done);
    if (done.length === activity.clips.length && completed.length < activity.clips.length)
      host.onEvent?.({ type: 'board.completed', activityId: activity.id });
    move('next');
  };
  // After a stall or an error mid-reveal, the learner can still go on.
  const skipToTell = () => {
    if (stage === 'reveal') move('ended');
  };
  const locked = stage === 'watch' || stage === 'guess';
  const syncTime = () => {
    const element = video.current;
    if (!element) return;
    const time = clampPlaybackTime(element.currentTime, clip.freezeAt, !locked);
    if (element.currentTime !== time) element.currentTime = time;
    if (stage === 'watch') setProgress(Math.min(1, time / clip.freezeAt));
    if (stage === 'watch' && time >= clip.freezeAt) freezeNow();
    else if (stage === 'guess') element.pause();
  };
  const authored = (value: string | undefined) => (value === undefined ? {} : content);
  const predictPrompt = clip.predictPrompt ?? chrome.predictTitle;
  const tellPrompt = clip.tellPrompt ?? chrome.tellTitle;
  const supportsLabel = clip.supportsLabel ?? chrome.supportsLabel;
  const supportsEnabled = isSupportsEnabled(activity, clip);
  const showSupports = supportsEnabled && !!clip.supports?.length;
  const toggleHelp = () => {
    const opening = !helpOpen;
    setHelpOpen(opening);
    host.onEvent?.({
      type: opening ? 'supports.shown' : 'supports.hidden',
      activityId: activity.id,
      clipId: clip.id,
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (hasCommandModifier(event) || isTypingTarget(event.target)) return;
    const target = event.target as HTMLElement;
    if (event.key === 'Escape' && stage !== 'board') {
      event.preventDefault();
      back();
      return;
    }
    // A focused control (a button, the video) handles Enter itself.
    if (event.key === 'Enter' && (target.tagName === 'BUTTON' || target.tagName === 'VIDEO'))
      return;
    const key = event.key.toLowerCase();
    const letter = shortcuts ? key : '';
    if (stage === 'guess' && (key === 'enter' || letter === 'r')) {
      event.preventDefault();
      reveal();
    } else if (
      stage === 'tell' &&
      (key === 'enter' || letter === 'a' || (letter === 'n' && !hasAnswer))
    ) {
      event.preventDefault();
      if (hasAnswer) showAnswer();
      else next();
    } else if (stage === 'tell' && letter === 'h' && showSupports) {
      event.preventDefault();
      toggleHelp();
    } else if (stage === 'answer' && letter === 'l') {
      event.preventDefault();
      void listen();
    } else if (stage === 'answer' && (key === 'enter' || letter === 'n')) {
      event.preventDefault();
      next();
    }
  };
  const captions = clip.captions;

  return (
    <Stage
      {...host}
      chromeLocale={chromeLocale}
      label={activity.title}
      style={activity.style}
      template="what-happens"
      stage={stage}
      onKeyDown={onKeyDown}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: Listen is the spoken version of the sample answer shown beside it. */}
      <audio ref={audio} />
      <header data-lkia-bar="">
        {stage === 'board' ? (
          <div data-lkia-heading="">
            <h1 {...content}>{activity.title}</h1>
            <p data-lkia-lede="">{chrome.boardHint}</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              data-lkia-back=""
              data-animate="button-press"
              aria-keyshortcuts="Escape"
              onClick={back}
            >
              <Icon name="back" /> {chrome.backButton}
            </button>
            <h1 data-lkia-eyebrow="">
              <span data-lkia-eyebrow-title="" {...content}>
                {activity.title}
              </span>
              <span data-lkia-eyebrow-count="">
                <span aria-hidden="true">· </span>
                {fillTemplate(chrome.clipCount, { n: clipIndex + 1, total: activity.clips.length })}
              </span>
            </h1>
          </>
        )}
      </header>
      {stage === 'board' ? (
        <ol
          data-lkia-board=""
          data-count={activity.clips.length}
          style={{ '--lkia-cols': boardColumns(activity.clips.length) } as CSSProperties}
        >
          {activity.clips.map((item, index) => {
            const done = completed.includes(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  style={{ '--i': index } as CSSProperties}
                  data-animate="card-stagger"
                  data-lkia-card=""
                  data-completed={done}
                  data-aspect={item.video.aspect}
                  // Back on the board, focus returns to the card the learner came from.
                  {...(index === clipIndex ? { 'data-lkia-focus': '' } : {})}
                  onClick={() => open(index)}
                >
                  <span data-lkia-thumb="">
                    {item.thumb ? (
                      <img src={resolveAssetUrl(item.thumb, host.resolveUrl)} alt="" />
                    ) : (
                      <video
                        src={previewUrl(
                          resolveAssetUrl(item.video, host.resolveUrl),
                          item.freezeAt,
                        )}
                        muted
                        playsInline
                        preload="metadata"
                        aria-hidden="true"
                        tabIndex={-1}
                      />
                    )}
                  </span>
                  <span data-lkia-card-title="" {...content}>
                    {item.title}
                  </span>
                  {done && (
                    <span data-lkia-done="">
                      <Icon name="check" /> {chrome.completedLabel}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div
          data-lkia-watch=""
          data-aspect={clip.video.aspect}
          data-has-backdrop={clip.poster !== undefined}
        >
          {clip.poster && (
            <>
              <div
                data-lkia-backdrop=""
                style={{
                  backgroundImage: `url("${resolveAssetUrl(clip.poster, host.resolveUrl)}")`,
                }}
              />
              <div data-lkia-veil="" />
            </>
          )}
          <div data-lkia-frame="" data-animate="video-glide">
            <video
              key={clip.id}
              ref={video}
              src={resolveAssetUrl(clip.video, host.resolveUrl)}
              poster={clip.poster ? resolveAssetUrl(clip.poster, host.resolveUrl) : undefined}
              // A captions file from another origin needs CORS on the video too.
              {...(captions ? { crossOrigin: 'anonymous' as const } : {})}
              playsInline
              preload="auto"
              // Frozen, the clip offers no controls: Replay and Reveal move it on.
              controls={stage !== 'guess'}
              aria-label={clip.title}
              style={{ aspectRatio: clip.video.aspect.replace(':', ' / ') }}
              onTimeUpdate={syncTime}
              onSeeking={syncTime}
              onPlay={() => {
                if (stage === 'guess') video.current?.pause();
              }}
              onPlaying={() => setBlocked(false)}
              onError={() => setError(true)}
              onEnded={() => {
                setEnded(true);
                if (stage === 'reveal') move('ended');
                // A clip that ends before its freeze point still freezes.
                else if (stage === 'watch') freezeNow();
              }}
            >
              {captions && (
                <track
                  kind="captions"
                  src={resolveAssetUrl(captions, host.resolveUrl)}
                  srcLang={captions.srclang ?? activity.locale}
                  label={captions.label ?? captions.srclang ?? activity.locale}
                  default
                />
              )}
            </video>
            {blocked && (
              <button
                ref={playButton}
                type="button"
                data-lkia-play=""
                data-animate="button-press"
                onClick={play}
              >
                <Icon name="play" /> {chrome.playFallback}
              </button>
            )}
          </div>
          <section data-lkia-panel="" data-animate="panel-fade">
            {error && (
              <p role="alert" data-lkia-error="">
                {chrome.mediaError}
              </p>
            )}
            {stage === 'watch' && !error && (
              <div data-lkia-watching="">
                <h2 data-lkia-hint="" data-lkia-focus="" tabIndex={-1}>
                  {chrome.watchHint}
                </h2>
                <span
                  data-lkia-progress=""
                  aria-hidden="true"
                  style={{ '--lkia-progress': progress } as CSSProperties}
                />
              </div>
            )}
            {stage === 'reveal' && (error || ended) && (
              <div data-lkia-actions="">
                <button
                  type="button"
                  data-lkia-primary=""
                  data-lkia-focus=""
                  data-animate="button-press"
                  onClick={skipToTell}
                >
                  {chrome.nextButton}
                </button>
              </div>
            )}
            {stage === 'guess' && (
              <>
                <h2
                  data-lkia-focus=""
                  tabIndex={-1}
                  {...authored(clip.predictPrompt ?? activity.copy?.predictTitle)}
                >
                  {predictPrompt}
                </h2>
                <div data-lkia-actions="">
                  <button
                    type="button"
                    data-lkia-primary=""
                    data-animate="button-press"
                    {...keyShortcuts(shortcuts, 'R')}
                    {...authored(activity.copy?.revealButton)}
                    onClick={reveal}
                  >
                    {chrome.revealButton}
                  </button>
                  <button
                    type="button"
                    data-animate="button-press"
                    {...authored(activity.copy?.replayToFreeze)}
                    onClick={() => move('replay')}
                  >
                    <Icon name="replay" /> {chrome.replayToFreeze}
                  </button>
                </div>
              </>
            )}
            {stage === 'tell' && (
              <>
                <h2
                  data-lkia-focus=""
                  tabIndex={-1}
                  {...authored(clip.tellPrompt ?? activity.copy?.tellTitle)}
                >
                  {tellPrompt}
                </h2>
                {showSupports && (
                  <div data-lkia-supports="" data-open={helpOpen}>
                    <button
                      type="button"
                      data-lkia-help-toggle=""
                      data-animate="button-press"
                      aria-expanded={helpOpen}
                      aria-controls={helpId}
                      {...keyShortcuts(shortcuts, 'H')}
                      onClick={toggleHelp}
                    >
                      <Icon name="help" />
                      <span {...authored(clip.supportsLabel ?? activity.copy?.supportsLabel)}>
                        {supportsLabel}
                      </span>
                      <span data-lkia-chevron="">
                        <Icon name="chevron" />
                      </span>
                    </button>
                    <div id={helpId} data-lkia-supports-body="" inert={!helpOpen}>
                      <ul {...content}>
                        {clip.supports?.map((support, index) => (
                          <li key={support} style={{ '--i': index } as CSSProperties}>
                            {support}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                <div data-lkia-actions="">
                  <button
                    type="button"
                    data-lkia-primary=""
                    data-animate="button-press"
                    {...keyShortcuts(shortcuts, hasAnswer ? 'A' : 'N')}
                    {...authored(hasAnswer ? activity.copy?.showAnswer : activity.copy?.nextButton)}
                    onClick={hasAnswer ? showAnswer : next}
                  >
                    {hasAnswer ? chrome.showAnswer : chrome.nextButton}
                  </button>
                </div>
              </>
            )}
            {stage === 'answer' && (
              <div data-animate="answer-fade-up">
                <h2 data-lkia-focus="" tabIndex={-1} {...authored(activity.copy?.answerLabel)}>
                  {chrome.answerLabel}
                </h2>
                <p data-lkia-answer="" {...content}>
                  {answerSegments(answerText, supportsEnabled ? (clip.supports ?? []) : []).map(
                    (segment) =>
                      segment.underline ? (
                        <mark data-lkia-underline="" key={segment.start}>
                          {segment.text}
                        </mark>
                      ) : (
                        segment.text
                      ),
                  )}
                </p>
                {listenError && (
                  <p role="alert" data-lkia-error="">
                    {chrome.listenError}
                  </p>
                )}
                <div data-lkia-actions="">
                  <button
                    type="button"
                    data-animate="button-press"
                    {...keyShortcuts(shortcuts, 'L')}
                    {...authored(activity.copy?.listenButton)}
                    onClick={() => void listen()}
                  >
                    <Icon name="listen" /> {chrome.listenButton}
                  </button>
                  <button
                    type="button"
                    data-lkia-primary=""
                    data-animate="button-press"
                    {...keyShortcuts(shortcuts, 'N')}
                    {...authored(activity.copy?.nextButton)}
                    onClick={next}
                  >
                    {chrome.nextButton}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </Stage>
  );
}
