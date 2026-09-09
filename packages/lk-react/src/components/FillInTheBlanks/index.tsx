'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
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
  // Read here rather than in the boundary: a class component cannot call a
  // hook, and the fallback it renders is learner-facing text like any other.
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <FillInTheBlanksCore {...props} />
    </ActivityErrorBoundary>
  );
}
