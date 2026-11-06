/**
 * The questions of a routed group, read off its items: one per multiple-choice
 * item, one per blank or gap of the others, numbered as on the paper. Read
 * defensively, because the checks run on drafts and on redacted items.
 */

import { passageWithoutPlaceholders, placeholderOrder } from '../answer-leak.js';

/** A question as the items define it, before the route says anything about it. */
export interface ItemQuestion {
  key: string;
  itemId: string;
  partId?: string;
  itemIndex: number;
  /** 0-based position among the group's questions. */
  position: number;
  type: string;
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const list = (value: unknown): Fields[] => (Array.isArray(value) ? value.filter(isFields) : []);

/** `itemId`, or `itemId#partId`: a question's name in traces and summaries. */
export function questionKey(itemId: string, partId?: string): string {
  return partId === undefined ? itemId : `${itemId}#${partId}`;
}

/** The ids of an item's parts in passage order: its blanks or gaps, or none for multiple choice. */
export function partIdsOf(item: unknown): string[] | null {
  if (!isFields(item)) {
    return null;
  }
  if (item.type === 'multiple-choice') {
    return null;
  }
  const declared = list(item.type === 'gap-select' ? item.gaps : item.blanks)
    .map((part) => part.id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
  const order = placeholderOrder(text(item.passage)).filter((id) => declared.includes(id));
  const rest = declared.filter((id) => !order.includes(id));
  return [...new Set([...order, ...rest])];
}

/** Every question of the group's items, in paper order. */
export function itemQuestions(items: readonly unknown[]): ItemQuestion[] {
  const found: ItemQuestion[] = [];
  items.forEach((item, itemIndex) => {
    if (!isFields(item) || typeof item.id !== 'string') {
      return;
    }
    const type = text(item.type);
    const parts = partIdsOf(item);
    if (parts === null) {
      found.push({
        key: questionKey(item.id),
        itemId: item.id,
        itemIndex,
        position: found.length,
        type,
      });
      return;
    }
    for (const partId of parts) {
      found.push({
        key: questionKey(item.id, partId),
        itemId: item.id,
        partId,
        itemIndex,
        position: found.length,
        type,
      });
    }
  });
  return found;
}

/** What the learner reads of an item: its instructions, question or passage, and its options or choices. */
export function learnerTextOf(item: unknown): string {
  if (!isFields(item)) {
    return '';
  }
  const parts = [text(item.instructions)];
  if (item.type === 'multiple-choice') {
    parts.push(text(item.question), ...list(item.options).map((option) => text(option.text)));
  } else {
    parts.push(passageWithoutPlaceholders(text(item.passage)));
    for (const gap of list(item.gaps)) {
      parts.push(...list(gap.choices).map((choice) => text(choice.text)));
    }
    for (const bank of list(item.banks)) {
      parts.push(...list(bank.choices).map((choice) => text(choice.text)));
    }
  }
  return parts.filter((part) => part !== '').join('\n');
}

/** The options or choices a question offers, by id, with their text and whether each is right. */
export function choicesOf(
  item: unknown,
  partId?: string,
): { id: string; text: string; correct: boolean }[] {
  if (!isFields(item)) {
    return [];
  }
  if (item.type === 'multiple-choice') {
    return list(item.options)
      .filter((option) => typeof option.id === 'string')
      .map((option) => ({
        id: option.id as string,
        text: text(option.text),
        correct: option.isCorrect === true,
      }));
  }
  if (item.type !== 'gap-select') {
    return [];
  }
  const gap = list(item.gaps).find((candidate) => candidate.id === partId);
  if (gap === undefined) {
    return [];
  }
  const bank = list(item.banks).find((candidate) => candidate.id === gap.bankId);
  const offered = gap.choices !== undefined ? list(gap.choices) : list(bank?.choices);
  return offered
    .filter((choice) => typeof choice.id === 'string')
    .map((choice) => ({
      id: choice.id as string,
      text: text(choice.text),
      correct: choice.id === gap.correctChoiceId,
    }));
}

/** The accepted answers of a blank. */
export function acceptedAnswersOf(item: unknown, partId?: string): string[] {
  if (!isFields(item) || item.type !== 'fill-in-the-blanks') {
    return [];
  }
  const blank = list(item.blanks).find((candidate) => candidate.id === partId);
  return Array.isArray(blank?.acceptedAnswers)
    ? blank.acceptedAnswers.filter((answer): answer is string => typeof answer === 'string')
    : [];
}

/** 1-based position of a blank or gap among its item's placeholders, for the leak check. */
export function placeholderPosition(item: unknown, partId?: string): number | undefined {
  if (!isFields(item) || partId === undefined) {
    return undefined;
  }
  const index = placeholderOrder(text(item.passage)).indexOf(partId);
  return index === -1 ? undefined : index + 1;
}
