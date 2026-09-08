import type { WrittenResponseData } from '@intellectif/lk-core';
import { redact } from '@intellectif/lk-core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WrittenResponse } from '../index.js';

/**
 * `<MultipleChoice>` and `<FillInTheBlanks>` have refused redacted data in
 * `practice` since 0.5.0, so that an exam item wired into the self-grading mode
 * fails at render rather than inside a submit handler no error boundary can
 * reach. `<WrittenResponse>` had no such guard.
 *
 * The asymmetry was easy to miss because this component never scores locally,
 * which made it look harmless — but `practice` still runs the local submit
 * path and emits a practice-mode xAPI statement for work the server is meant to
 * grade. An all-essay redacted paper mounted without `renderMode` therefore
 * rendered, stayed answerable, and reported success at every step. The one item
 * type whose grading is entirely someone else's job was the one that failed
 * silently.
 */
const essay: WrittenResponseData = {
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'w1',
  title: 'Essay',
  prompt: 'Describe your last holiday.',
  minWords: 1,
  maxWords: 100,
};

describe('WrittenResponse with redacted data', () => {
  it('fails at render in practice mode rather than submitting to nowhere', () => {
    render(<WrittenResponse data={redact(essay) as never} onSubmitted={vi.fn()} />);

    // The boundary-wrapped export degrades a render throw to an alert.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it.each(['exam', 'review'] as const)('renders normally in %s mode', (renderMode) => {
    render(
      <WrittenResponse
        data={redact(essay) as never}
        renderMode={renderMode}
        onSubmit={vi.fn()}
        {...(renderMode === 'review'
          ? { outcome: { status: 'deferred', reason: 'requires_async_grading', maxScore: 1 } }
          : {})}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('still renders unredacted data in practice', () => {
    render(<WrittenResponse data={essay} onSubmitted={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
