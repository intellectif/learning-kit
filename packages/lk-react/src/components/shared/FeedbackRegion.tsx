import type { ReactNode, Ref } from 'react';

export interface FeedbackRegionProps {
  /** Identifier so activity inputs can reference this region via aria. */
  id?: string;
  className?: string;
  children?: ReactNode;
  /**
   * Where focus can be put, when what focus was on goes away: "Show answer",
   * pressed, leaves the page. Given, the region takes `tabIndex={-1}` — focus
   * by script, never a stop in the tab order.
   */
  ref?: Ref<HTMLDivElement>;
}

/**
 * A polite ARIA live region. Screen readers announce content injected here
 * (score, feedback, state changes) without moving focus. Pure/presentational
 * — safe to render in any environment.
 */
export function FeedbackRegion({ id, className, children, ref }: FeedbackRegionProps) {
  return (
    <div
      id={id}
      className={className}
      aria-live="polite"
      aria-atomic="true"
      ref={ref}
      {...(ref !== undefined ? { tabIndex: -1 } : {})}
    >
      {children}
    </div>
  );
}
