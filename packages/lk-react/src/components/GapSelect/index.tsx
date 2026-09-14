'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import { GapSelect as GapSelectCore, type GapSelectProps } from './GapSelect.js';

export type { GapSelectProps } from './GapSelect.js';

/**
 * Public Gap Select activity: the core wrapped in `ActivityErrorBoundary` so a
 * render failure (including the dev schema-validation throw and the
 * redacted-in-`practice` guard) degrades to an accessible fallback instead of
 * crashing the host.
 */
export function GapSelect(props: GapSelectProps) {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <GapSelectCore {...props} />
    </ActivityErrorBoundary>
  );
}
