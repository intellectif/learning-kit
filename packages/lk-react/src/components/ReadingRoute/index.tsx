'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import { ReadingRoute as ReadingRouteCore, type ReadingRouteProps } from './ReadingRoute.js';

export type { ReadingRouteProps, ReadingRouteResult } from './ReadingRoute.js';

/**
 * Public reading route: the player wrapped in `ActivityErrorBoundary`, so a
 * render failure — the development-time schema check among them — degrades to
 * an accessible fallback instead of taking the host page down.
 *
 * A formative tool, for practice — not for official summative exams, which
 * `<ActivitySequence>` delivers with the same group presented as a testlet.
 */
export function ReadingRoute(props: ReadingRouteProps): React.JSX.Element {
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary
      {...(props.group?.title !== undefined ? { activityTitle: props.group.title } : {})}
      strings={strings}
    >
      <ReadingRouteCore {...props} />
    </ActivityErrorBoundary>
  );
}
