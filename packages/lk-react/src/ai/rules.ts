/**
 * When AI help is offered, and what the SDK does with what a port answers.
 *
 * Internal: these are the rules behind {@link useAiHints} and
 * {@link useAiExplanation}, which are what a host calls. They live apart from
 * the hooks so the hooks' module exports nothing but the hooks themselves.
 */
import {
  type AiRefusal,
  aiAllowedByContent,
  aiSupports,
  type ItemOutcome,
  type LearnerResponse,
} from '@intellectif/lk-core';
import { isDevelopment } from '../components/_internal.js';
import type { RenderableActivity, RenderMode } from '../components/types.js';
import type { LearnerAi } from './LkAiProvider.js';

/** The most hints a question gives when the host names no number, and the most it may name. */
const DEFAULT_MAX_HINTS = 3;
const MAX_HINTS_CEILING = 10;

/** `maxHints` as a whole number from 1 to 10; anything else is the default. */
export function hintLimit(ai: LearnerAi | undefined): number {
  const asked = ai?.maxHints;
  return typeof asked === 'number' && Number.isInteger(asked) && asked >= 1
    ? Math.min(asked, MAX_HINTS_CEILING)
    : DEFAULT_MAX_HINTS;
}

/**
 * Whether the learner may ask for a hint: `practice`, before submit, on a
 * question that is not disabled, of a type that takes hints, whose author left
 * hints on, and whole — a redacted item is an exam's, and gives none.
 */
export function hintOffered(input: {
  data: RenderableActivity;
  renderMode: RenderMode;
  submitted: boolean;
  disabled: boolean;
}): boolean {
  const { data, renderMode, submitted, disabled } = input;
  return (
    renderMode === 'practice' &&
    !submitted &&
    !disabled &&
    data.redacted !== true &&
    aiSupports(data.type, 'hint') &&
    aiAllowedByContent(data, 'hint')
  );
}

/**
 * Whether the learner may ask for an explanation: of a graded answer — in
 * `practice` once submitted, or in `review` when the grade of record is
 * scored — of a type the SDK explains, whose author left explanations on.
 * Never in `exam`.
 */
export function explanationOffered(input: {
  data: RenderableActivity;
  renderMode: RenderMode;
  submitted: boolean;
  outcome: ItemOutcome | undefined;
}): boolean {
  const { data, renderMode, submitted, outcome } = input;
  const graded =
    (renderMode === 'practice' && submitted) ||
    (renderMode === 'review' && outcome?.status === 'scored');
  return graded && aiSupports(data.type, 'explanation') && aiAllowedByContent(data, 'explanation');
}

/** Calls a port, turning a synchronous throw into a rejection. */
export function callPort<T>(call: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(call());
  } catch (error) {
    return Promise.reject(error);
  }
}

/** Tells a developer why a port's answer was not shown. Silent in production. */
export function warnRefused(
  feature: 'explanation' | 'hint',
  activityId: string,
  reason: AiRefusal,
): void {
  if (isDevelopment()) {
    console.warn(
      `learning-kit: the AI ${feature} for "${activityId}" was not shown (${reason}). The learner saw "not available" instead.`,
    );
  }
}

/** The language to write in: the host's choice for the learner, else the interface language. */
export const localeOf = (
  ai: LearnerAi | undefined,
  locale: string | undefined,
): { learnerLocale?: string } => {
  const chosen = ai?.learnerLocale ?? locale;
  return chosen === undefined ? {} : { learnerLocale: chosen };
};

/** What an explanation is about: when any of it changes, the explanation shown no longer is. */
export function explanationKey(
  renderMode: RenderMode,
  submitted: boolean,
  response: LearnerResponse,
  outcome: ItemOutcome | undefined,
): string {
  let graded = '';
  if (outcome !== undefined) {
    graded = `${outcome.status}:${'score' in outcome ? outcome.score : ''}`;
  }
  return `${renderMode}|${submitted}|${graded}|${JSON.stringify(response)}`;
}
