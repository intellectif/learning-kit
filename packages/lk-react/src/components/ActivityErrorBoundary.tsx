'use client';

import { Component, type ReactNode } from 'react';

function isProduction(): boolean {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.NODE_ENV === 'production';
}

export interface ActivityErrorBoundaryProps {
  /** Shown in the production fallback when a render error occurs. */
  activityTitle?: string;
  children: ReactNode;
}

interface ActivityErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors in an activity subtree. In development it renders the
 * full error stack to aid debugging; in production it renders an accessible,
 * generic fallback (optionally naming the activity) so a single broken
 * activity never crashes the host application.
 */
export class ActivityErrorBoundary extends Component<
  ActivityErrorBoundaryProps,
  ActivityErrorBoundaryState
> {
  state: ActivityErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ActivityErrorBoundaryState {
    return { error };
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    if (!isProduction()) {
      return (
        <div role="alert">
          <strong>Activity failed to render</strong>
          <pre>{error.stack ?? error.message}</pre>
        </div>
      );
    }

    return (
      <div role="alert">
        {this.props.activityTitle
          ? `"${this.props.activityTitle}" could not be displayed.`
          : 'This activity could not be displayed.'}
      </div>
    );
  }
}
