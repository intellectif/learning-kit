import type { ReactNode } from 'react';

export interface FeedbackRegionProps {
  /** Identifier so activity inputs can reference this region via aria. */
  id?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * A polite ARIA live region. Screen readers announce content injected here
 * (score, feedback, state changes) without moving focus. Pure/presentational
 * — safe to render in any environment.
 */
export function FeedbackRegion({ id, className, children }: FeedbackRegionProps) {
  return (
    <div id={id} className={className} aria-live="polite" aria-atomic="true">
      {children}
    </div>
  );
}
