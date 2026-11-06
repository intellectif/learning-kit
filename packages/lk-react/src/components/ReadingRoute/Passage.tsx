'use client';

import type { PassageLayout, TextRange } from '@intellectif/lk-core';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';

/** How a stretch of the passage is marked. Each is drawn with a shape as well as a colour. */
export type DecorationKind = 'target' | 'context' | 'pair' | 'lure' | 'mark';

export interface Decoration extends TextRange {
  kind: DecorationKind;
  /** For `pair`: its number, shown at its start and beside the question words it matches. */
  pair?: number;
}

export interface PassageProps {
  body: string;
  title?: string;
  layout: PassageLayout;
  decorations: readonly Decoration[];
  /** Text outside it is dimmed: where not to search. */
  zone?: TextRange;
  /** `locate`: the learner picks one sentence. `mark`: the learner toggles sentences as evidence. */
  selecting: 'locate' | 'mark' | null;
  marked: ReadonlySet<number>;
  onSelect: (sentence: number) => void;
  /** Focuses the first selectable sentence when this changes to a new value. */
  focusRequest: number;
  /** The passage's accessible name: what to do in it, while choosing a sentence. */
  label: string;
  locale?: string;
}

const KIND_ORDER: readonly DecorationKind[] = ['target', 'pair', 'lure', 'mark', 'context'];

function piecesOf(
  body: string,
  start: number,
  end: number,
  decorations: readonly Decoration[],
  zone: TextRange | undefined,
): ReactNode[] {
  const cuts = new Set([start, end]);
  for (const decoration of decorations) {
    if (decoration.end > start && decoration.start < end) {
      cuts.add(Math.max(start, decoration.start));
      cuts.add(Math.min(end, decoration.end));
    }
  }
  if (zone !== undefined) {
    for (const edge of [zone.start, zone.end]) {
      if (edge > start && edge < end) {
        cuts.add(edge);
      }
    }
  }
  const points = [...cuts].sort((a, b) => a - b);
  const pieces: ReactNode[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index] as number;
    const to = points[index + 1] as number;
    const covering = decorations.filter(
      (decoration) => decoration.start < to && decoration.end > from,
    );
    const kinds = KIND_ORDER.filter((kind) =>
      covering.some((decoration) => decoration.kind === kind),
    );
    const dim = zone !== undefined && (to <= zone.start || from >= zone.end);
    const pairStarts = covering.filter(
      (decoration) =>
        decoration.kind === 'pair' && decoration.start === from && decoration.pair !== undefined,
    );
    const text = body.slice(from, to);
    if (kinds.length === 0 && !dim) {
      pieces.push(text);
      continue;
    }
    pieces.push(
      <span
        key={from}
        className="lk-rr-piece"
        data-kind={kinds.join(' ') || undefined}
        data-dim={dim || undefined}
      >
        {pairStarts.map((decoration) => (
          <sup key={`p${decoration.pair}`} className="lk-rr-pair-number" aria-hidden="true">
            {decoration.pair}
          </sup>
        ))}
        {text}
      </span>,
    );
  }
  return pieces;
}

/**
 * The passage, drawn from the plain-text body as paragraphs and sentences, so
 * every mark sits on exactly the words the route names. Marks are spans the
 * accessibility tree reads as text; what a step points to is announced by the
 * guide instead. In `locate` and `mark` modes each sentence is a button,
 * moved between with the arrow keys.
 */
export function Passage({
  body,
  title,
  layout,
  decorations,
  zone,
  selecting,
  marked,
  onSelect,
  focusRequest,
  label,
  locale,
}: PassageProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const firstSelectable = (() => {
    if (zone === undefined) {
      return 0;
    }
    return layout.sentences.find((sentence) => sentence.end > zone.start)?.index ?? 0;
  })();
  const [active, setActive] = useState(firstSelectable);
  const last = layout.sentences.length - 1;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new request moves focus
  useEffect(() => {
    if (focusRequest === 0 || selecting === null) {
      return;
    }
    setActive(firstSelectable);
    rootRef.current?.querySelector<HTMLElement>(`[data-s="${firstSelectable}"]`)?.focus();
  }, [focusRequest]);

  const move = (to: number): void => {
    const next = Math.max(0, Math.min(last, to));
    setActive(next);
    rootRef.current?.querySelector<HTMLElement>(`[data-s="${next}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number): void => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        move(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        move(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(last);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect(index);
        break;
    }
  };

  const markedDecorations: Decoration[] = [...marked].flatMap((index) => {
    const sentence = layout.sentences[index];
    return sentence === undefined
      ? []
      : [{ start: sentence.start, end: sentence.end, kind: 'mark' as const }];
  });
  const all = [...decorations, ...markedDecorations];

  const paragraphs = layout.paragraphs.map((paragraph) => {
    const sentences = layout.sentences.filter((sentence) => sentence.paragraph === paragraph.index);
    const content: ReactNode[] = [];
    let cursor = paragraph.start;
    for (const sentence of sentences) {
      if (sentence.start > cursor) {
        content.push(...piecesOf(body, cursor, sentence.start, all, zone));
      }
      const inner = piecesOf(body, sentence.start, sentence.end, all, zone);
      const isMarked = marked.has(sentence.index);
      content.push(
        selecting === null ? (
          <span key={`s${sentence.index}`} className="lk-rr-sentence" data-s={sentence.index}>
            {inner}
          </span>
        ) : (
          // A sentence becomes a control only while the learner is choosing one.
          // biome-ignore lint/a11y/useSemanticElements: a <button> cannot hold a sentence that wraps across lines inside running text
          <span
            key={`s${sentence.index}`}
            className="lk-rr-sentence"
            data-s={sentence.index}
            data-selectable=""
            role="button"
            tabIndex={sentence.index === active ? 0 : -1}
            aria-pressed={selecting === 'mark' ? isMarked : undefined}
            onClick={() => {
              setActive(sentence.index);
              onSelect(sentence.index);
            }}
            onKeyDown={(event) => onKeyDown(event, sentence.index)}
            onFocus={() => setActive(sentence.index)}
          >
            {inner}
          </span>
        ),
      );
      cursor = sentence.end;
    }
    if (cursor < paragraph.end) {
      content.push(...piecesOf(body, cursor, paragraph.end, all, zone));
    }
    const section =
      paragraph.section === undefined ? undefined : layout.sections[paragraph.section];
    return (
      <div key={paragraph.index} className="lk-rr-paragraph-group">
        {section !== undefined && section.first === paragraph.index ? (
          <p className="lk-rr-section">
            <span className="lk-rr-section-label">{section.label}</span>
            {section.title !== undefined ? (
              <span className="lk-rr-section-title">{section.title}</span>
            ) : null}
          </p>
        ) : null}
        <p className="lk-rr-paragraph" data-paragraph={paragraph.index}>
          {paragraph.label !== undefined ? (
            <span className="lk-rr-paragraph-label">{paragraph.label}</span>
          ) : null}
          {content}
        </p>
      </div>
    );
  });

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <fieldset> would make running prose a form control group; the group only names what to do in the passage
    <div
      className="lk-rr-passage-text"
      ref={rootRef}
      role="group"
      aria-label={label}
      data-selecting={selecting ?? undefined}
      lang={locale}
    >
      {title !== undefined ? <p className="lk-rr-passage-title">{title}</p> : null}
      {paragraphs}
    </div>
  );
}
