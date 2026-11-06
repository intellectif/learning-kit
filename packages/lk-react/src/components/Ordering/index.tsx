'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import { Ordering as OrderingCore, type OrderingProps } from './Ordering.js';

export type { OrderingProps } from './Ordering.js';

/**
 * Public Ordering activity: the core wrapped in `ActivityErrorBoundary` so a
 * render failure (including the dev schema-validation throw and the
 * redacted-in-`practice` guard) degrades to an accessible fallback instead of
 * crashing the host.
 */
export function Ordering(props: OrderingProps): React.JSX.Element {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <OrderingCore {...props} />
    </ActivityErrorBoundary>
  );
}
