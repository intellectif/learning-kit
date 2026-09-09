'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import {
  MultipleChoice as MultipleChoiceCore,
  type MultipleChoiceProps,
} from './MultipleChoice.js';

export type { MultipleChoiceProps } from './MultipleChoice.js';

/**
 * Public Multiple Choice activity: the core component wrapped in
 * `ActivityErrorBoundary` so a render failure (incl. the dev schema-validation
 * throw) degrades to an accessible fallback instead of crashing the host.
 */
export function MultipleChoice(props: MultipleChoiceProps) {
  // Read here rather than in the boundary: a class component cannot call a
  // hook, and the fallback it renders is learner-facing text like any other.
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <MultipleChoiceCore {...props} />
    </ActivityErrorBoundary>
  );
}
