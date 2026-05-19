'use client';

import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import {
  FillInTheBlanks as FillInTheBlanksCore,
  type FillInTheBlanksProps,
} from './FillInTheBlanks.js';

export type { FillInTheBlanksProps } from './FillInTheBlanks.js';

/**
 * Public Fill-in-the-Blanks activity: the core wrapped in
 * `ActivityErrorBoundary` so a render failure (incl. the dev schema-validation
 * throw) degrades to an accessible fallback instead of crashing the host.
 */
export function FillInTheBlanks(props: FillInTheBlanksProps) {
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title}>
      <FillInTheBlanksCore {...props} />
    </ActivityErrorBoundary>
  );
}
