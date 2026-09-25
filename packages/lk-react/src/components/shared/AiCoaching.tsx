'use client';

import { useEffect, useRef } from 'react';
import { type AiCoachingInput, useAiCoaching } from '../../ai/useAiHelp.js';
import type { LkStrings } from '../../i18n/strings.js';

/**
 * "Coach me on this reading": the SDK's own surface over {@link useAiCoaching}
 * — a button, the coaching with who wrote it, and "not available" when a call
 * fails or its answer is refused. `<PronunciationFeedback>` renders it under
 * the marks it shows, and `<ReadAloud>` under the marks a review reads back
 * from a stored grade.
 *
 * Each word coached is shown as the marks show it, in the reading's own
 * language and direction; its tip is in the learner's. Nothing renders without
 * a port, or where the rules say no coaching.
 */
export function ReadingCoaching({
  strings: s,
  contentLang,
  contentDir,
  ...input
}: AiCoachingInput & {
  strings: LkStrings;
  /** The reading's language, put on each word coached and on nothing else. */
  contentLang: string | undefined;
  contentDir: 'ltr' | 'rtl' | undefined;
}) {
  const help = useAiCoaching(input);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const refocus = useRef(false);

  // The button that asked goes away when the coaching arrives — one per
  // reading — so focus moves to what it asked for rather than to the page.
  useEffect(() => {
    if (help.status === 'shown' && refocus.current) {
      refocus.current = false;
      panelRef.current?.focus();
    }
    if (help.status === 'unavailable') {
      refocus.current = false;
    }
  }, [help.status]);

  if (!help.offered) {
    return null;
  }

  const ask = (): void => {
    refocus.current =
      typeof document !== 'undefined' && document.activeElement === buttonRef.current;
    help.ask();
  };

  const loading = help.status === 'loading';
  const coaching = help.coaching;
  return (
    <div className="lk-ai lk-ai-coaching" data-state={help.status}>
      {coaching === null ? (
        <button
          ref={buttonRef}
          type="button"
          className="lk-ai-button"
          aria-busy={loading || undefined}
          aria-disabled={loading || undefined}
          onClick={ask}
        >
          {loading ? s.aiCoachingLoading : s.aiCoaching}
        </button>
      ) : null}
      <div aria-live="polite">
        {coaching !== null ? (
          <section
            ref={panelRef}
            className="lk-ai-panel"
            tabIndex={-1}
            aria-label={s.aiCoachingHeading}
          >
            <p className="lk-ai-heading">{s.aiCoachingHeading}</p>
            <p className="lk-ai-text">{coaching.text}</p>
            {coaching.words.length > 0 ? (
              <ul className="lk-ai-coaching-words" aria-label={s.aiCoachingWords}>
                {coaching.words.map((entry) => (
                  // A word of the text is coached once, so its id is its key.
                  <li key={entry.itemId} className="lk-ai-coaching-word">
                    <span
                      className="lk-ai-coaching-target"
                      dir={contentDir ?? 'auto'}
                      lang={contentLang}
                    >
                      {entry.word}
                    </span>
                    {entry.sound !== undefined ? (
                      <span className="lk-ai-coaching-sound">
                        {s.aiCoachingSound(entry.sound.expected, entry.sound.heard)}
                      </span>
                    ) : null}
                    <span className="lk-ai-text">{entry.tip}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="lk-ai-notice">{s.aiNotice}</p>
          </section>
        ) : help.status === 'unavailable' ? (
          <p className="lk-ai-unavailable">{s.aiCoachingUnavailable}</p>
        ) : null}
      </div>
    </div>
  );
}
