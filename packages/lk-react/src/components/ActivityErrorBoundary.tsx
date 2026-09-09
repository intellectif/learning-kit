'use client';

import { Component, type ReactNode } from 'react';
import type { LkStrings } from '../i18n/strings.js';
import { DEFAULT_STRINGS } from '../i18n/strings.js';

function isProduction(): boolean {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.NODE_ENV === 'production';
}

export interface ActivityErrorBoundaryProps {
  /** Shown in the production fallback when a render error occurs. */
  activityTitle?: string;
  /**
   * Chrome text. A class component cannot call `useLkStrings`, so the public
   * wrapper reads the hook and hands the resolved dictionary down.
   */
  strings?: LkStrings;
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
          <strong>{(this.props.strings ?? DEFAULT_STRINGS).activityFailed}</strong>
          <pre>{error.stack ?? error.message}</pre>
        </div>
      );
    }

    return (
      <div role="alert">
        {this.props.activityTitle
          ? (this.props.strings ?? DEFAULT_STRINGS).activityFailedNamed(this.props.activityTitle)
          : (this.props.strings ?? DEFAULT_STRINGS).activityFailedUnnamed}
      </div>
    );
  }
}
