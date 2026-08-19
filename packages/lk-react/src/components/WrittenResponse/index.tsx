'use client';

import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';
import {
  WrittenResponse as WrittenResponseCore,
  type WrittenResponseProps,
} from './WrittenResponse.js';

export type { WrittenResponseProps, WrittenResponseSubmission } from './WrittenResponse.js';

/**
 * Public Written Response activity: a labelled textarea with a live word
 * counter for free-text writing graded asynchronously (AI or human). The core
 * is wrapped in `ActivityErrorBoundary` so a render failure (incl. the dev
 * schema-validation throw) degrades to an accessible fallback.
 */
export function WrittenResponse(props: WrittenResponseProps) {
  return (
    <ActivityErrorBoundary activityTitle={props.data?.title}>
      <WrittenResponseCore {...props} />
    </ActivityErrorBoundary>
  );
}
