'use client';

import { useLkStrings } from '../../i18n/LkIntlProvider.js';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import {
  WrittenResponse as WrittenResponseCore,
  type WrittenResponseProps,
} from './WrittenResponse.js';

export type { HtmlSanitizer, Renderable, RenderMode } from '../types.js';
export type { WrittenResponseProps, WrittenResponseSubmission } from './WrittenResponse.js';

/**
 * Public Written Response activity: a labelled textarea with a live word
 * counter for free-text writing graded asynchronously (AI or human). The core
 * is wrapped in `ActivityErrorBoundary` so a render failure (incl. the dev
 * schema-validation throw) degrades to an accessible fallback.
 */
export function WrittenResponse(props: WrittenResponseProps) {
  // Read here rather than in the boundary: a class component cannot call a
  // hook, and the fallback it renders is learner-facing text like any other.
  const strings = useLkStrings(props.strings);
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title} strings={strings}>
      <WrittenResponseCore {...props} />
    </ActivityErrorBoundary>
  );
}
