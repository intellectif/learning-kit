/**
 * Pointing at part of a question the SDK's own components drew: their
 * instructions, their question, one blank, gap or prompt, their options. The marks are
 * an attribute on the element, set and cleared from outside, so no question
 * component has to know a route exists; key words inside a question are
 * painted with the CSS Custom Highlight API where the browser has it, and are
 * named by the guide's text everywhere.
 */

import type { RouteQuestionPart } from '@intellectif/lk-core';

export const TARGET_ATTRIBUTE = 'data-lk-route-target';

const INSTRUCTIONS =
  '.lk-mc-instructions, .lk-fib-instructions, .lk-gs-instructions, .lk-mt-instructions';
const PARTS = '.lk-fib-blank, .lk-fib-answer, .lk-gs-gap, .lk-mt-prompt';

/** The elements of a question card that a step's `part` names. `ordinal` is the blank's, gap's or prompt's, 1-based. */
export function partElements(
  card: HTMLElement,
  part: RouteQuestionPart,
  ordinal: number | undefined,
): HTMLElement[] {
  const one = (selector: string): HTMLElement[] => {
    const found = card.querySelector<HTMLElement>(selector);
    return found === null ? [] : [found];
  };
  const blank = (): HTMLElement[] => {
    if (ordinal === undefined) {
      return [];
    }
    const found = card.querySelectorAll<HTMLElement>(PARTS)[ordinal - 1];
    return found === undefined ? [] : [found];
  };
  switch (part) {
    case 'instructions':
      return one(INSTRUCTIONS);
    case 'question':
      return ordinal === undefined ? one('.lk-mc legend') : blank();
    case 'answer':
      return ordinal === undefined ? one('.lk-mc legend') : blank();
    case 'options': {
      // A matching item's list is shared by its prompts: the whole list.
      const options = [...card.querySelectorAll<HTMLElement>('.lk-mc-option, .lk-mt-option')];
      return options.length > 0 ? options : blank();
    }
  }
}

/** Clears every part mark inside `root`. */
export function clearPartMarks(root: HTMLElement): void {
  for (const element of root.querySelectorAll(`[${TARGET_ATTRIBUTE}]`)) {
    element.removeAttribute(TARGET_ATTRIBUTE);
  }
}

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

const HIGHLIGHT = 'lk-route-phrase';
const painted = new Map<symbol, Range[]>();

function registry(): {
  highlights: HighlightRegistry;
  Highlight: new (...ranges: Range[]) => unknown;
} | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (css?.highlights === undefined || typeof Highlight !== 'function') {
    return null;
  }
  return { highlights: css.highlights, Highlight };
}

/** The ranges of `phrases` in the text of `root`, matched without regard to case. */
export function phraseRanges(root: HTMLElement, phrases: readonly string[]): Range[] {
  const ranges: Range[] = [];
  const document = root.ownerDocument;
  for (const phrase of phrases) {
    const needle = phrase.trim().toLowerCase();
    if (needle === '') {
      continue;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.nodeValue ?? '').toLowerCase();
      const at = text.indexOf(needle);
      if (at !== -1) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        ranges.push(range);
        break;
      }
    }
  }
  return ranges;
}

/**
 * Paints `ranges` as this route's key words, beside every other route's on the
 * page, or clears them with an empty list. Does nothing where the browser has
 * no custom highlights.
 */
export function paintPhrases(owner: symbol, ranges: readonly Range[]): void {
  const found = registry();
  if (found === null) {
    return;
  }
  if (ranges.length === 0) {
    painted.delete(owner);
  } else {
    painted.set(owner, [...ranges]);
  }
  const all = [...painted.values()].flat();
  if (all.length === 0) {
    found.highlights.delete(HIGHLIGHT);
    return;
  }
  found.highlights.set(HIGHLIGHT, new found.Highlight(...all));
}
