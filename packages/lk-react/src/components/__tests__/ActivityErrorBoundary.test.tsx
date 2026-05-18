import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityErrorBoundary } from '../ActivityErrorBoundary.js';

function Boom(): never {
  throw new Error('kaboom-stack');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('ActivityErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ActivityErrorBoundary>
        <span>safe content</span>
      </ActivityErrorBoundary>,
    );
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('renders the full error in development', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ActivityErrorBoundary activityTitle="Quiz">
        <Boom />
      </ActivityErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('kaboom-stack');
  });

  it('renders a generic titled fallback in production (no stack)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    render(
      <ActivityErrorBoundary activityTitle="Quiz">
        <Boom />
      </ActivityErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Quiz');
    expect(alert).not.toHaveTextContent('kaboom-stack');
  });
});
