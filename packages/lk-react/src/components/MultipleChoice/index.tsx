'use client';

import type { MultipleChoiceData } from '@intellectif/lk-core';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import type { ActivityProps } from '../types.js';
import { MultipleChoice as MultipleChoiceCore } from './MultipleChoice.js';

export type { ActivityProps } from '../types.js';

/**
 * Public Multiple Choice activity: the core component wrapped in
 * `ActivityErrorBoundary` so a render failure (incl. the dev schema-validation
 * throw) degrades to an accessible fallback instead of crashing the host.
 */
export function MultipleChoice(props: ActivityProps<MultipleChoiceData>) {
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title}>
      <MultipleChoiceCore {...props} />
    </ActivityErrorBoundary>
  );
}
