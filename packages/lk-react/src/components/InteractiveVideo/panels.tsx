'use client';

import type { MediaTrack, TimelineChapter } from '@intellectif/lk-core';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { LkStrings } from '../../i18n/strings.js';
import { clock, SPEEDS } from './format.js';
import { CheckIcon, ChevronIcon, CloseIcon, ReplayIcon } from './icons.js';
import type { CaptionSize, VideoPreferences } from './prefs.js';
import type { MarkerState } from './Scrubber.js';
import { SHORTCUT_KEYS } from './shortcuts.js';
import { pairSecondaryCues, secondaryCandidates } from './tracks.js';
import type { Cue } from './vtt.js';

/**
 * A menu of items, with the arrow keys moving between them and Escape closing
 * it — focus then goes back to the button that opened it. When the menu opens
 * focus goes to the row a sub-page was left for, when coming back from one;
 * else the checked item; else the first.
 */
function Menu({
  label,
  onClose,
  children,
  returnTo,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** The `data-menu-key` of the row to focus, when this page is returned to. */
  returnTo?: string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    const back =
      returnTo === undefined
        ? null
        : ref.current?.querySelector<HTMLElement>(`[data-menu-key="${returnTo}"]`);
    const checked = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (back ?? checked ?? items?.[0])?.focus();
  }, [returnTo]);
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (to: number): void => {
      event.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (event.key === 'ArrowDown') {
      move(at + 1);
    } else if (event.key === 'ArrowUp') {
      move(at - 1);
    } else if (event.key === 'Home') {
      move(0);
    } else if (event.key === 'End') {
      move(items.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    // Everything else stays inside the menu: a letter must not reach the player's shortcuts.
    event.stopPropagation();
  };
  return (
    <div ref={ref} className="lk-iv-menu" role="menu" aria-label={label} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

export function SpeedMenu({
  speed,
  strings,
  onChoose,
  onClose,
}: {
  speed: number;
  strings: LkStrings;
  onChoose: (speed: number) => void;
  onClose: () => void;
}) {
  return (
    <Menu label={strings.media.speed} onClose={onClose}>
      {SPEEDS.map((rate) => (
        <button
          key={rate}
          type="button"
          role="menuitemradio"
          aria-checked={rate === speed}
          className="lk-iv-menu-item"
          onClick={() => onChoose(rate)}
        >
          <span>{strings.videoSpeedValue(rate)}</span>
          {rate === speed ? <CheckIcon /> : null}
        </button>
      ))}
    </Menu>
  );
}

type SettingsPage = 'main' | 'captions' | 'second' | 'size';

export function SettingsMenu({
  preferences,
  tracks,
  primaryTrack,
  secondaryTrack,
  captionsFailed,
  strings,
  onChange,
  onCaptionTrack,
  onSecondaryTrack,
  onShowShortcuts,
  onClose,
}: {
  preferences: VideoPreferences;
  tracks: readonly MediaTrack[];
  /** The track each caption line shows now; see `resolveCaptionTracks`. */
  primaryTrack: MediaTrack | undefined;
  secondaryTrack: MediaTrack | undefined;
  /** Per line: which language could not be loaded. */
  captionsFailed: { primary: boolean; secondary: boolean };
  strings: LkStrings;
  onChange: (change: Partial<VideoPreferences>) => void;
  /** A first language picked; the player swaps it with the second when they meet. */
  onCaptionTrack: (track: MediaTrack) => void;
  /** A second language picked, or `null` for none. */
  onSecondaryTrack: (track: MediaTrack | null) => void;
  onShowShortcuts: () => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState<SettingsPage>('main');
  // The page just left, so its row on the page returned to takes focus again.
  const [returnTo, setReturnTo] = useState<SettingsPage | undefined>(undefined);
  const open = (next: SettingsPage): void => {
    setReturnTo(undefined);
    setPage(next);
  };
  const leave = (): void => {
    setReturnTo(page);
    setPage(page === 'second' ? 'captions' : 'main');
  };
  const captionsValue =
    !preferences.captions || primaryTrack === undefined
      ? strings.videoOff
      : secondaryTrack === undefined
        ? primaryTrack.label
        : strings.videoCaptionPair(primaryTrack.label, secondaryTrack.label);
  // Every other language: never the first line's own, which would print the same words twice.
  const partners = secondaryCandidates(tracks, primaryTrack);
  const failedNotes = (
    <>
      {captionsFailed.primary && page === 'captions' ? (
        <p className="lk-iv-menu-note" role="status">
          {strings.videoCaptionsFailed}
        </p>
      ) : null}
      {captionsFailed.secondary ? (
        <p className="lk-iv-menu-note" role="status">
          {strings.videoSecondaryCaptionsFailed}
        </p>
      ) : null}
    </>
  );
  const back = (
    <button
      type="button"
      role="menuitem"
      className="lk-iv-menu-item lk-iv-menu-back"
      onClick={leave}
    >
      <ChevronIcon direction="left" />
      <span>
        {page === 'captions'
          ? strings.videoCaptionLanguage
          : page === 'second'
            ? strings.videoSecondCaptionLanguage
            : strings.videoCaptionSize}
      </span>
    </button>
  );
  /** A radio naming a track in its own language and writing direction. */
  const trackRadio = (track: MediaTrack, on: boolean, choose: () => void): ReactNode => (
    <button
      key={`${track.kind}:${track.srclang}`}
      type="button"
      role="menuitemradio"
      aria-checked={on}
      className="lk-iv-menu-item"
      lang={track.srclang}
      onClick={choose}
    >
      <span dir="auto">{track.label}</span>
      {on ? <CheckIcon /> : null}
    </button>
  );
  if (page === 'captions') {
    return (
      <Menu
        key="captions"
        label={strings.videoCaptionLanguage}
        onClose={onClose}
        returnTo={returnTo}
      >
        {back}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={!preferences.captions}
          className="lk-iv-menu-item"
          onClick={() => onChange({ captions: false })}
        >
          <span>{strings.videoOff}</span>
          {!preferences.captions ? <CheckIcon /> : null}
        </button>
        {tracks.map((track) =>
          trackRadio(track, preferences.captions && primaryTrack === track, () =>
            onCaptionTrack(track),
          ),
        )}
        {partners.length > 0 ? (
          <button
            type="button"
            role="menuitem"
            className="lk-iv-menu-item"
            data-menu-key="second"
            onClick={() => open('second')}
          >
            <span>{strings.videoSecondCaptionLanguage}</span>
            <span className="lk-iv-menu-value">
              <span dir="auto" lang={secondaryTrack?.srclang}>
                {secondaryTrack === undefined ? strings.videoOff : secondaryTrack.label}
              </span>
              <ChevronIcon direction="right" />
            </span>
          </button>
        ) : null}
        {failedNotes}
      </Menu>
    );
  }
  if (page === 'second') {
    return (
      <Menu key="second" label={strings.videoSecondCaptionLanguage} onClose={onClose}>
        {back}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={secondaryTrack === undefined}
          className="lk-iv-menu-item"
          onClick={() => onSecondaryTrack(null)}
        >
          <span>{strings.videoOff}</span>
          {secondaryTrack === undefined ? <CheckIcon /> : null}
        </button>
        {partners.map((track) =>
          trackRadio(track, secondaryTrack === track, () => onSecondaryTrack(track)),
        )}
        {failedNotes}
      </Menu>
    );
  }
  if (page === 'size') {
    return (
      <Menu key="size" label={strings.videoCaptionSize} onClose={onClose}>
        {back}
        {(['small', 'medium', 'large'] as CaptionSize[]).map((size) => (
          <button
            key={size}
            type="button"
            role="menuitemradio"
            aria-checked={preferences.captionSize === size}
            className="lk-iv-menu-item"
            onClick={() => onChange({ captionSize: size })}
          >
            <span>{strings.videoCaptionSizeValue(size)}</span>
            {preferences.captionSize === size ? <CheckIcon /> : null}
          </button>
        ))}
      </Menu>
    );
  }
  return (
    <Menu key="main" label={strings.videoSettings} onClose={onClose} returnTo={returnTo}>
      {tracks.length > 0 ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="lk-iv-menu-item"
            data-menu-key="captions"
            onClick={() => open('captions')}
          >
            <span>{strings.videoCaptionLanguage}</span>
            <span className="lk-iv-menu-value">
              <span dir="auto">{captionsValue}</span>
              <ChevronIcon direction="right" />
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="lk-iv-menu-item"
            data-menu-key="size"
            onClick={() => open('size')}
          >
            <span>{strings.videoCaptionSize}</span>
            <span className="lk-iv-menu-value">
              {strings.videoCaptionSizeValue(preferences.captionSize)}
              <ChevronIcon direction="right" />
            </span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={preferences.captionBackground}
            className="lk-iv-menu-item"
            onClick={() => onChange({ captionBackground: !preferences.captionBackground })}
          >
            <span>{strings.videoCaptionBackground}</span>
            <span className="lk-iv-menu-value">
              {preferences.captionBackground ? strings.videoOn : strings.videoOff}
            </span>
          </button>
        </>
      ) : null}
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={preferences.shortcuts}
        className="lk-iv-menu-item"
        onClick={() => onChange({ shortcuts: !preferences.shortcuts })}
      >
        <span>{strings.videoKeyboardShortcuts}</span>
        <span className="lk-iv-menu-value">
          {preferences.shortcuts ? strings.videoOn : strings.videoOff}
        </span>
      </button>
      <button type="button" role="menuitem" className="lk-iv-menu-item" onClick={onShowShortcuts}>
        <span>{strings.videoShortcutList}</span>
        <kbd className="lk-iv-kbd">?</kbd>
      </button>
    </Menu>
  );
}

/** The shortcut list, over the video. The same table the key handler reads. */
export function ShortcutSheet({ strings, onClose }: { strings: LkStrings; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  return (
    <div
      className="lk-iv-sheet"
      role="dialog"
      aria-modal="false"
      aria-label={strings.videoKeyboardShortcuts}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === '?') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="lk-iv-sheet-head">
        <h3 className="lk-iv-sheet-title">{strings.videoKeyboardShortcuts}</h3>
        <button
          ref={closeRef}
          type="button"
          className="lk-iv-button"
          aria-label={strings.videoClose}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <dl className="lk-iv-shortcuts">
        {SHORTCUT_KEYS.map(({ action, keys }) => (
          <div key={action} className="lk-iv-shortcut">
            <dt>
              <kbd className="lk-iv-kbd">{keys}</kbd>
            </dt>
            <dd>{strings.videoShortcut(action)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export interface ContentsQuiz {
  id: string;
  at: number;
  title: string;
  answered: number;
  total: number;
  required: boolean;
  state: MarkerState;
}

/**
 * The panel below the video: the chapters and quizzes in time order, and the
 * transcript. Nothing here costs a request — the transcript is the captions,
 * already parsed.
 */
export function ContentsPanel({
  idPrefix,
  tab,
  onTab,
  chapters,
  quizzes,
  cues,
  primaryLanguage,
  secondaryCues,
  secondaryLanguage,
  activeCue,
  limit,
  strings,
  onSeek,
  onOpenQuiz,
}: {
  /** Unique per player, so two players on one page never share an id. */
  idPrefix: string;
  tab: 'contents' | 'transcript';
  onTab: (tab: 'contents' | 'transcript') => void;
  chapters: readonly TimelineChapter[];
  quizzes: readonly ContentsQuiz[];
  /** The first caption line's cues: one transcript row each. */
  cues: readonly Cue[];
  primaryLanguage?: string | undefined;
  /** The second line's cues, shown under the row each overlaps most; empty for none. */
  secondaryCues: readonly Cue[];
  secondaryLanguage?: string | undefined;
  activeCue: number;
  /** No line past this point is listed (the no-skip-ahead spoiler rule). */
  limit: number;
  strings: LkStrings;
  onSeek: (seconds: number) => void;
  onOpenQuiz: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const followUntil = useRef(0);
  const hasTranscript = cues.length > 0;
  const shownTab = hasTranscript ? tab : 'contents';

  // Paired once per pair of tracks; the spoiler limit and the search filter
  // what is paired, so neither re-pairs as the video plays.
  const paired = useMemo(() => pairSecondaryCues(cues, secondaryCues), [cues, secondaryCues]);
  const lines = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return cues
      .map((cue, index) => ({
        cue,
        index,
        // The spoiler limit holds for the second language as for the first.
        second: (paired[index] ?? [])
          .filter((line) => line.start <= limit)
          .map((line) => line.text)
          .join(' '),
      }))
      .filter(({ cue }) => cue.start <= limit)
      .filter(
        ({ cue, second }) =>
          trimmed === '' ||
          cue.text.toLowerCase().includes(trimmed) ||
          second.toLowerCase().includes(trimmed),
      );
  }, [cues, paired, limit, query]);

  // Follows the spoken line, unless the learner scrolled the list themselves a
  // moment ago, or is searching: a list that jumps away mid-read is worse than
  // one that waits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeCue is the trigger — the list follows the line being spoken
  useEffect(() => {
    if (shownTab !== 'transcript' || query.trim() !== '' || Date.now() < followUntil.current) {
      return;
    }
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (active !== null && active !== undefined && listRef.current !== null) {
      const list = listRef.current;
      const top = active.offsetTop - list.clientHeight / 3;
      list.scrollTo?.({ top, behavior: 'smooth' });
    }
  }, [activeCue, shownTab, query]);

  const rows = [
    ...chapters.map((chapter) => ({ kind: 'chapter' as const, at: chapter.at, chapter })),
    ...quizzes.map((quiz) => ({ kind: 'quiz' as const, at: quiz.at, quiz })),
  ].sort((a, b) => a.at - b.at || (a.kind === 'chapter' ? -1 : 1));

  const highlight = (text: string): ReactNode => {
    const trimmed = query.trim();
    const at = trimmed === '' ? -1 : text.toLowerCase().indexOf(trimmed.toLowerCase());
    if (at === -1) {
      return text;
    }
    return (
      <>
        {text.slice(0, at)}
        <mark>{text.slice(at, at + trimmed.length)}</mark>
        {text.slice(at + trimmed.length)}
      </>
    );
  };

  return (
    <section className="lk-iv-panel" aria-label={strings.videoPanel}>
      {hasTranscript ? (
        <div className="lk-iv-tabs" role="tablist" aria-label={strings.videoPanel}>
          {(['contents', 'transcript'] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${name}`}
              aria-controls={`${idPrefix}-tabpanel`}
              aria-selected={shownTab === name}
              tabIndex={shownTab === name ? 0 : -1}
              className="lk-iv-tab"
              onClick={() => onTab(name)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  onTab(name === 'contents' ? 'transcript' : 'contents');
                }
              }}
            >
              {name === 'contents' ? strings.videoContents : strings.videoTranscript}
            </button>
          ))}
        </div>
      ) : null}
      {shownTab === 'contents' ? (
        <ol
          className="lk-iv-contents"
          {...(hasTranscript
            ? {
                role: 'tabpanel',
                id: `${idPrefix}-tabpanel`,
                'aria-labelledby': `${idPrefix}-tab-contents`,
              }
            : { 'aria-label': strings.videoContents })}
        >
          {rows.map((row) =>
            row.kind === 'chapter' ? (
              <li key={`c-${row.at}`} className="lk-iv-contents-chapter">
                <button type="button" className="lk-iv-row" onClick={() => onSeek(row.chapter.at)}>
                  <span className="lk-iv-row-time">{clock(row.chapter.at)}</span>
                  <span className="lk-iv-row-title">{row.chapter.title}</span>
                </button>
              </li>
            ) : (
              <li
                key={`q-${row.quiz.id}`}
                className="lk-iv-contents-quiz"
                data-state={row.quiz.state}
              >
                <button type="button" className="lk-iv-row" onClick={() => onOpenQuiz(row.quiz.id)}>
                  <span className="lk-iv-row-time">{clock(row.quiz.at)}</span>
                  <span className="lk-iv-row-title">
                    <span
                      className="lk-iv-marker-dot"
                      data-state={row.quiz.state}
                      aria-hidden="true"
                    />
                    {row.quiz.title}
                    {row.quiz.required ? (
                      <>
                        {' '}
                        <span className="lk-iv-tag">{strings.videoRequired}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="lk-iv-row-status">
                    {strings.videoQuizProgress(row.quiz.answered, row.quiz.total)}
                  </span>
                </button>
              </li>
            ),
          )}
        </ol>
      ) : (
        <div
          className="lk-iv-transcript"
          role="tabpanel"
          id={`${idPrefix}-tabpanel`}
          aria-labelledby={`${idPrefix}-tab-transcript`}
        >
          <input
            id={`${idPrefix}-search`}
            className="lk-iv-search"
            type="search"
            value={query}
            placeholder={strings.videoTranscriptSearch}
            aria-label={strings.videoTranscriptSearch}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div
            ref={listRef}
            className="lk-iv-lines"
            onWheel={() => {
              followUntil.current = Date.now() + 4000;
            }}
            onTouchMove={() => {
              followUntil.current = Date.now() + 4000;
            }}
          >
            {lines.length === 0 ? (
              <p className="lk-iv-empty">{strings.videoTranscriptNoMatch}</p>
            ) : (
              lines.map(({ cue, index, second }) => (
                <button
                  key={`${cue.start}-${index}`}
                  type="button"
                  className="lk-iv-line"
                  data-active={index === activeCue || undefined}
                  onClick={() => onSeek(cue.start)}
                >
                  <span className="lk-iv-row-time">{clock(cue.start)}</span>
                  {secondaryCues.length === 0 ? (
                    <span lang={primaryLanguage} dir="auto">
                      {highlight(cue.text)}
                    </span>
                  ) : (
                    <span className="lk-iv-line-text">
                      <span lang={primaryLanguage} dir="auto">
                        {highlight(cue.text)}
                      </span>
                      {second === '' ? null : (
                        <span className="lk-iv-line-secondary" lang={secondaryLanguage} dir="auto">
                          {highlight(second)}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Over the last frame: what the learner did, and where to go from here. */
export function EndScreen({
  idPrefix,
  renderMode,
  quizzes,
  answered,
  total,
  percent,
  strings,
  onOpenQuiz,
  onWatchAgain,
  onFinish,
}: {
  idPrefix: string;
  renderMode: 'practice' | 'exam' | 'review';
  quizzes: readonly ContentsQuiz[];
  answered: number;
  total: number;
  percent: number | null;
  strings: LkStrings;
  onOpenQuiz: (id: string) => void;
  onWatchAgain: () => void;
  onFinish: (() => void) | undefined;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section className="lk-iv-end" aria-labelledby={`${idPrefix}-end-title`}>
      <div className="lk-iv-end-card">
        <h3 id={`${idPrefix}-end-title`} ref={headingRef} tabIndex={-1} className="lk-iv-end-title">
          {strings.videoEnded}
        </h3>
        {total > 0 ? (
          <p className="lk-iv-end-summary">
            {percent !== null && renderMode !== 'exam'
              ? strings.videoEndScore(answered, total, percent)
              : strings.videoEndAnswered(answered, total)}
          </p>
        ) : null}
        {quizzes.length > 0 ? (
          <ol className="lk-iv-end-list">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <button
                  type="button"
                  className="lk-iv-row"
                  data-state={quiz.state}
                  onClick={() => onOpenQuiz(quiz.id)}
                >
                  <span className="lk-iv-row-time">{clock(quiz.at)}</span>
                  <span className="lk-iv-row-title">
                    <span className="lk-iv-marker-dot" data-state={quiz.state} aria-hidden="true" />
                    {quiz.title}
                  </span>
                  <span className="lk-iv-row-status">
                    {strings.videoQuizProgress(quiz.answered, quiz.total)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="lk-iv-end-actions">
          <button type="button" className="lk-iv-action" onClick={onWatchAgain}>
            <ReplayIcon />
            {strings.videoWatchAgain}
          </button>
          {onFinish !== undefined ? (
            <button type="button" className="lk-iv-action lk-iv-action-primary" onClick={onFinish}>
              {strings.videoFinish}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
