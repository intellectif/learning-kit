'use client';

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
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title}>
      <MultipleChoiceCore {...props} />
    </ActivityErrorBoundary>
  );
}
