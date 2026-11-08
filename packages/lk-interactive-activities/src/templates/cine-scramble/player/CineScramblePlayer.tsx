import type { JSX } from 'react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../../../player/resolve-url.js';
import { Stage } from '../../../player/Stage.js';
import type { PlayerHostOptions } from '../../../player/types.js';
import { cineScrambleChrome } from '../copy.js';
import { type CineScrambleClip, type CineScrambleData, isVocabEnabled } from '../schema.js';
import {
  checkSlots,
  placeClip,
  shuffleClips,
  stitchCaptions,
  unplaceClip,
  wrapRows,
} from './machine.js';
export interface CineScramblePlayerProps extends PlayerHostOptions {
  activity: CineScrambleData;
}
function LoopVideo({
  clip,
  host,
  playLabel,
  errorLabel,
}: {
  clip: CineScrambleClip;
  host: PlayerHostOptions;
  playLabel: string;
  errorLabel: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const element = ref.current;
    void element?.play().catch(() => {
      if (active) setBlocked(true);
    });
    return () => {
      active = false;
      element?.pause();
    };
  }, []);
  return (
    <>
      <video
        ref={ref}
        src={resolveAssetUrl(clip.video, host.resolveUrl)}
        muted
        loop
        playsInline
        autoPlay
        style={{ aspectRatio: clip.video.aspect.replace(':', ' / ') }}
        onError={() => setError(true)}
      />
      {blocked && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            void ref.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setError(true));
          }}
        >
          {playLabel}
        </button>
      )}
      {error && <p role="alert">{errorLabel}</p>}
    </>
  );
}
export function CineScramblePlayer({ activity, ...host }: CineScramblePlayerProps): JSX.Element {
  const chrome = { ...cineScrambleChrome(activity.locale), ...activity.copy, ...host.strings };
  const [stage, setStage] = useState<'start' | 'arranging' | 'checked-correct'>('start');
  const [sceneIndex, setSceneIndex] = useState(0);
  const scene = activity.scenes[sceneIndex];
  const [slots, setSlots] = useState<(number | null)[]>([]);
  const [pool, setPool] = useState<CineScrambleClip[]>([]);
  const [results, setResults] = useState<boolean[]>([]);
  const [vocab, setVocab] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  const drag = useRef<number | null>(null);
  const vocabButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (vocab) closeButton.current?.focus();
  }, [vocab]);
  const start = () => {
    setSlots(scene.clips.map(() => null));
    setPool(shuffleClips(scene.clips));
    setResults([]);
    setStage('arranging');
    host.onEvent?.({ type: 'scramble.started', activityId: activity.id, sceneId: scene.id });
  };
  const assign = (clipId: number, index: number) => {
    setSlots((previous) => placeClip(previous, clipId, index));
    setResults([]);
  };
  const remove = (index: number) => {
    setSlots((previous) => unplaceClip(previous, index));
    setResults([]);
  };
  const check = () => {
    const checked = checkSlots(slots);
    setResults(checked);
    const correct = checked.every(Boolean);
    host.onEvent?.({
      type: 'scramble.checked',
      activityId: activity.id,
      sceneId: scene.id,
      correct,
    });
    if (correct) {
      setStage('checked-correct');
      host.onEvent?.({ type: 'scramble.completed', activityId: activity.id, sceneId: scene.id });
    }
  };
  const closeVocab = () => {
    setVocab(false);
    vocabButton.current?.focus();
  };
  const renderClip = (clip: CineScrambleClip) => (
    <LoopVideo
      clip={clip}
      host={host}
      playLabel={chrome.playFallback}
      errorLabel={chrome.mediaError}
    />
  );
  const label = (clip: CineScrambleClip) =>
    `${chrome.clipLabel} ${pool.findIndex((item) => item.id === clip.id) + 1}`;
  const draggable = (clip: CineScrambleClip) => (
    <fieldset
      data-lkia-clip={clip.id}
      key={clip.id}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        drag.current = clip.id;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current === null) return;
        const root = event.currentTarget.closest('[data-lkia-root]');
        const element = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest('[data-lkia-slot]');
        setTarget(
          element && root?.contains(element)
            ? Number(element.getAttribute('data-lkia-slot'))
            : null,
        );
      }}
      onPointerUp={(event) => {
        const id = drag.current;
        drag.current = null;
        setTarget(null);
        if (id === null) return;
        const root = event.currentTarget.closest('[data-lkia-root]');
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element || !root?.contains(element)) return;
        const slot = element.closest('[data-lkia-slot]');
        if (slot) assign(id, Number(slot.getAttribute('data-lkia-slot')));
        else if (element.closest('[data-lkia-pool]'))
          setSlots((previous) => previous.map((value) => (value === id ? null : value)));
      }}
      onPointerCancel={() => {
        drag.current = null;
        setTarget(null);
      }}
    >
      {renderClip(clip)}
      <button
        type="button"
        aria-label={label(clip)}
        aria-describedby={`${activity.id}-instructions`}
        onKeyDown={(event) => {
          const index = Number(event.key) - 1;
          if (Number.isInteger(index) && index >= 0 && index < slots.length) {
            event.preventDefault();
            assign(clip.id, index);
          }
        }}
      >
        {label(clip)}
      </button>
    </fieldset>
  );
  let offset = 0;
  const ordered = [...scene.clips].sort((a, b) => a.id - b.id);
  return (
    <Stage
      {...host}
      style={activity.style ?? { presetId: 'cinema-dark', mode: 'dark' }}
      template="cine-scramble"
      stage={stage}
      onKeyDown={(event) => {
        if (vocab && event.key === 'Escape') {
          event.preventDefault();
          closeVocab();
        }
        if (vocab && event.key === 'Tab') {
          event.preventDefault();
          closeButton.current?.focus();
        }
        if (!vocab && stage === 'arranging' && event.key.toLowerCase() === 'c') {
          event.preventDefault();
          check();
        }
      }}
    >
      <h1>{activity.title}</h1>
      {stage === 'start' && (
        <>
          {activity.tagline && <p>{activity.tagline}</p>}
          {activity.poster && (
            <img
              data-lkia-poster=""
              src={resolveAssetUrl(activity.poster, host.resolveUrl)}
              alt=""
            />
          )}
          {activity.scenes.length > 1 && (
            <label>
              {chrome.sceneLabel}
              <select
                value={sceneIndex}
                onChange={(event) => setSceneIndex(Number(event.target.value))}
              >
                {activity.scenes.map((item, index) => (
                  <option key={item.id} value={index}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={start}>
            {chrome.startLabel}
          </button>
        </>
      )}
      {stage === 'arranging' && (
        <>
          <h2>{scene.title}</h2>
          <p id={`${activity.id}-instructions`}>{chrome.keyboardHelp}</p>
          <div
            data-lkia-slots=""
            style={{ '--lkia-clip-count': scene.clips.length } as CSSProperties}
          >
            {ordered.map((clip, index) => {
              const placed = scene.clips.find((item) => item.id === slots[index]);
              return (
                <section
                  key={clip.id}
                  data-lkia-slot={index}
                  data-drop-target={target === index}
                  data-slot-result={
                    results.length ? (results[index] ? 'correct' : 'incorrect') : undefined
                  }
                  aria-label={`${chrome.slotLabel} ${index + 1}`}
                  onKeyDown={(event) => {
                    if (['Delete', 'Backspace'].includes(event.key)) {
                      event.preventDefault();
                      remove(index);
                    }
                  }}
                >
                  {placed ? (
                    <>
                      {draggable(placed)}
                      <button type="button" onClick={() => remove(index)}>
                        {chrome.removeLabel}
                      </button>
                    </>
                  ) : (
                    <span>
                      {chrome.slotLabel} {index + 1}
                    </span>
                  )}
                  <p>{clip.caption}</p>
                  {results.length > 0 && (
                    <p role="status">
                      {results[index] ? chrome.correctLabel : chrome.incorrectLabel}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
          <section data-lkia-pool="" aria-label={chrome.poolLabel}>
            {pool.filter((clip) => !slots.includes(clip.id)).map(draggable)}
          </section>
          <button type="button" onClick={check}>
            {chrome.checkLabel}
          </button>
        </>
      )}
      {stage === 'checked-correct' && (
        <div data-animate="panel-fade">
          <h2>{chrome.completeLabel}</h2>
          <p>{stitchCaptions(scene.clips)}</p>
          {wrapRows(ordered.length).map((count, row) => {
            const clips = ordered.slice(offset, offset + count);
            offset += count;
            return (
              <div data-lkia-row={row} key={clips[0]?.id}>
                {clips.map((clip) => (
                  <figure key={clip.id}>
                    {renderClip(clip)}
                    <figcaption>{clip.caption}</figcaption>
                  </figure>
                ))}
              </div>
            );
          })}
          {activity.scenes.length > 1 && (
            <button type="button" onClick={() => setStage('start')}>
              {chrome.sceneLabel}
            </button>
          )}
        </div>
      )}
      {isVocabEnabled(activity) && !!activity.vocab?.length && (
        <button
          ref={vocabButton}
          type="button"
          onClick={() => {
            setVocab(true);
            host.onEvent?.({ type: 'vocab.opened', activityId: activity.id });
          }}
        >
          {chrome.vocabButtonLabel}
        </button>
      )}
      {vocab && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={chrome.vocabButtonLabel}
          data-lkia-vocab=""
          data-lkia-panel=""
        >
          <button ref={closeButton} type="button" onClick={closeVocab}>
            {chrome.closeLabel}
          </button>
          <dl>
            {activity.vocab?.map((item) => (
              <div key={item.term}>
                <dt>{item.term}</dt>
                <dd>{item.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Stage>
  );
}
