import type { CSSProperties, JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../../../player/resolve-url.js';
import { Stage } from '../../../player/Stage.js';
import type { PlayerHostOptions } from '../../../player/types.js';
import { whatHappensChrome } from '../copy.js';
import { isSupportsEnabled, type WhatHappensData } from '../schema.js';
import { answerSegments } from './answer-text.js';
import { listenToAnswer } from './listen.js';
import {
  clampPlaybackTime,
  nextWhatHappensStage,
  type WhatHappensAction,
  type WhatHappensStage,
} from './machine.js';
export interface WhatHappensPlayerProps extends PlayerHostOptions {
  activity: WhatHappensData;
}
export function WhatHappensPlayer({ activity, ...host }: WhatHappensPlayerProps): JSX.Element {
  const chrome = { ...whatHappensChrome(activity.locale), ...activity.copy, ...host.strings };
  const [stage, setStage] = useState<WhatHappensStage>('board');
  const [clipIndex, setClipIndex] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const [controls, setControls] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const live = useRef(true);
  const listenGeneration = useRef(0);
  const clip = activity.clips[clipIndex];
  const move = (action: WhatHappensAction) =>
    setStage((previous) => nextWhatHappensStage(previous, action));
  const emit = (
    type: 'clip.opened' | 'clip.frozen' | 'clip.revealed' | 'answer.shown' | 'clip.completed',
  ) => {
    host.onEvent?.({ type, activityId: activity.id, clipId: clip.id });
  };
  const stopListening = () => {
    listenGeneration.current += 1;
    audio.current?.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };
  useEffect(() => {
    live.current = true;
    const element = audio.current;
    return () => {
      live.current = false;
      listenGeneration.current += 1;
      clearTimeout(timer.current);
      element?.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);
  useEffect(() => {
    if (stage !== 'watch' && stage !== 'reveal') return;
    const element = video.current;
    if (!element) return;
    element.currentTime = stage === 'watch' ? 0 : clip.freezeAt;
    setBlocked(false);
    let active = true;
    void element.play().catch(() => {
      if (active) setBlocked(true);
    });
    return () => {
      active = false;
      element.pause();
    };
  }, [stage, clip]);
  const play = () => {
    setBlocked(false);
    void video.current?.play().catch(() => {
      if (live.current) setBlocked(true);
    });
  };
  const reveal = () => {
    if (stage === 'guess') {
      emit('clip.revealed');
      move('reveal');
    }
  };
  const showAnswer = () => {
    if (stage === 'tell') {
      emit('answer.shown');
      move('answer');
    }
  };
  const listen = async () => {
    if (!audio.current) return;
    stopListening();
    const generation = listenGeneration.current;
    const isActive = () => live.current && generation === listenGeneration.current;
    try {
      const via = await listenToAnswer(clip, audio.current, host.resolveUrl, isActive);
      if (via && isActive())
        host.onEvent?.({ type: 'audio.played', activityId: activity.id, clipId: clip.id, via });
    } catch {
      if (isActive()) setError(true);
    }
  };
  const next = () => {
    if (stage !== 'answer') return;
    stopListening();
    emit('clip.completed');
    const done = completed.includes(clip.id) ? completed : [...completed, clip.id];
    setCompleted(done);
    if (done.length === activity.clips.length && completed.length < activity.clips.length)
      host.onEvent?.({ type: 'board.completed', activityId: activity.id });
    move('next');
  };
  const showControls = () => {
    setControls(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setControls(false), 2500);
  };
  const locked = stage === 'watch' || stage === 'guess';
  const syncTime = () => {
    const element = video.current;
    if (!element) return;
    const time = clampPlaybackTime(element.currentTime, clip.freezeAt, !locked);
    if (element.currentTime !== time) element.currentTime = time;
    if (stage === 'watch' && time >= clip.freezeAt) {
      element.pause();
      emit('clip.frozen');
      move('freeze');
    } else if (stage === 'guess') element.pause();
  };
  return (
    <Stage
      {...host}
      style={activity.style}
      template="what-happens"
      stage={stage}
      onKeyDown={(event) => {
        // Native focused buttons already handle Enter. Shortcuts never consume form input.
        const target = event.target as HTMLElement;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
          return;
        if (event.key === 'Enter' && target.tagName === 'BUTTON') return;
        const key = event.key.toLowerCase();
        if (stage === 'guess' && ['enter', 'r'].includes(key)) {
          event.preventDefault();
          reveal();
        }
        if (stage === 'tell' && ['enter', 'a'].includes(key)) {
          event.preventDefault();
          showAnswer();
        }
        if (stage === 'answer' && key === 'l') {
          event.preventDefault();
          void listen();
        }
        if (stage === 'answer' && ['enter', 'n'].includes(key)) {
          event.preventDefault();
          next();
        }
      }}
    >
      <h1>{activity.title}</h1>
      {/* biome-ignore lint/a11y/useMediaCaption: Listen is the spoken version of the adjacent sample answer. */}
      <audio ref={audio} />
      {stage === 'board' ? (
        <div data-lkia-board="">
          {activity.clips.map((item, index) => (
            <button
              key={item.id}
              type="button"
              style={{ '--i': index } as CSSProperties}
              data-animate="card-stagger"
              data-completed={completed.includes(item.id)}
              onClick={() => {
                setClipIndex(index);
                setError(false);
                setBlocked(false);
                showControls();
                move('open');
                host.onEvent?.({ type: 'clip.opened', activityId: activity.id, clipId: item.id });
              }}
            >
              {item.thumb && <img src={resolveAssetUrl(item.thumb, host.resolveUrl)} alt="" />}
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <div data-lkia-watch="" onPointerMove={showControls} onFocusCapture={showControls}>
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
          {/* biome-ignore lint/a11y/useMediaCaption: The v1 video contract has no caption track; authored speaking media is supplied by the host. */}
          <video
            ref={video}
            src={resolveAssetUrl(clip.video, host.resolveUrl)}
            playsInline
            controls={controls}
            aria-label={clip.title}
            style={{ aspectRatio: clip.video.aspect.replace(':', ' / ') }}
            data-animate="video-glide"
            onTimeUpdate={syncTime}
            onSeeking={syncTime}
            onPlay={() => {
              if (stage === 'guess') video.current?.pause();
            }}
            onError={() => setError(true)}
            onEnded={() => {
              if (stage === 'reveal') move('ended');
              else if (stage === 'watch') syncTime();
            }}
          />
          <section data-lkia-panel="" data-animate="panel-fade">
            {error && <p role="alert">{chrome.mediaError}</p>}
            {blocked && (
              <button type="button" onClick={play}>
                {chrome.playFallback}
              </button>
            )}
            {stage === 'guess' && (
              <>
                <h2>{clip.predictPrompt ?? chrome.predictTitle}</h2>
                <div data-lkia-actions="">
                  <button type="button" onClick={reveal}>
                    {chrome.revealButton}
                  </button>
                  <button type="button" onClick={() => move('replay')}>
                    {chrome.replayToFreeze}
                  </button>
                </div>
              </>
            )}
            {stage === 'tell' && (
              <>
                <h2>{clip.tellPrompt ?? chrome.tellTitle}</h2>
                {isSupportsEnabled(activity, clip) && !!clip.supports?.length && (
                  <div>
                    <h3>{clip.supportsLabel ?? chrome.supportsLabel}</h3>
                    <ul>
                      {clip.supports.map((support) => (
                        <li key={support}>{support}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button type="button" onClick={showAnswer}>
                  {chrome.showAnswer}
                </button>
              </>
            )}
            {stage === 'answer' && (
              <div data-animate="answer-fade-up">
                <h2>{chrome.answerLabel}</h2>
                <p>
                  {answerSegments(clip.answer.text, clip.supports ?? []).map((segment) =>
                    segment.underline ? (
                      <mark data-lkia-underline="" key={segment.start}>
                        {segment.text}
                      </mark>
                    ) : (
                      segment.text
                    ),
                  )}
                </p>
                <div data-lkia-actions="">
                  <button type="button" onClick={() => void listen()}>
                    {chrome.listenButton}
                  </button>
                  <button type="button" onClick={next}>
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
