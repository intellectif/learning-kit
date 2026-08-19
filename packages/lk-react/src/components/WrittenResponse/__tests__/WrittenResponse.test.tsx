import type { WrittenResponseData } from '@intellectif/lk-core';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { checkA11y } from '../../../test-support/a11y.js';
import { WrittenResponse } from '../index.js';

const wr = (over: Partial<WrittenResponseData> = {}): WrittenResponseData => ({
  schemaVersion: '1.0',
  type: 'written-response',
  id: 'w1',
  title: 'Essay',
  prompt: 'Describe your favourite place.',
  minWords: 2,
  maxWords: 5,
  ...over,
});

describe('WrittenResponse', () => {
  it('renders the prompt, a textarea labelled by it, and the word counter', () => {
    render(<WrittenResponse data={wr()} onSubmitted={vi.fn()} />);
    expect(screen.getByText('Describe your favourite place.')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Describe your favourite place.' }),
    ).toBeInTheDocument();
    const counter = document.getElementById('w1-counter');
    expect(counter).toHaveTextContent('0 words (2–5 words)');
    expect(counter).toHaveAttribute('aria-live', 'polite');
  });

  it('renders activity media above the prompt when present', () => {
    render(
      <WrittenResponse
        data={wr({ media: { type: 'image', url: 'https://x.test/p.png', alt: 'Scene' } })}
        onSubmitted={vi.fn()}
      />,
    );
    expect(screen.getByRole('img', { name: 'Scene' })).toBeInTheDocument();
  });

  it('shows an "up to" bounds label when minWords is 0', () => {
    render(<WrittenResponse data={wr({ minWords: 0 })} onSubmitted={vi.fn()} />);
    expect(document.getElementById('w1-counter')).toHaveTextContent('0 words (up to 5 words)');
  });

  it('updates the live counter while typing and fires text-changed', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(<WrittenResponse data={wr()} onSubmitted={vi.fn()} onInteraction={onInteraction} />);
    await user.type(screen.getByRole('textbox'), 'hello world');
    expect(document.getElementById('w1-counter')).toHaveTextContent('2 words (2–5 words)');
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'text-changed',
        activityId: 'w1',
        payload: { wordCount: 2 },
      }),
    );
  });

  it('disables submit while the textarea is empty or whitespace-only', async () => {
    const user = userEvent.setup();
    render(<WrittenResponse data={wr()} onSubmitted={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole('textbox'), '   ');
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'words now');
    expect(submit).toBeEnabled();
  });

  it('submits once with verbatim text, recomputed word count, bounds flag, and time', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(<WrittenResponse data={wr()} onSubmitted={onSubmitted} />);
    const textarea = screen.getByRole('textbox');
    await user.click(textarea);
    await user.paste('one  two\n three');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmitted).toHaveBeenCalledTimes(1);
    const submission = onSubmitted.mock.calls[0]?.[0];
    expect(submission.text).toBe('one  two\n three');
    expect(submission.wordCount).toBe(3);
    expect(submission.withinWordBounds).toBe(true);
    expect(submission.timeSpent).toBeGreaterThanOrEqual(0);
  });

  it('builds a SUBMITTED xAPI statement with the response but no score fields', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(<WrittenResponse data={wr()} onSubmitted={onSubmitted} />);
    await user.click(screen.getByRole('textbox'));
    await user.paste('graded later, not now');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const statement = onSubmitted.mock.calls[0]?.[0].xapiStatement;
    expect(statement.verb.id).toBe('http://activitystrea.ms/schema/1.0/submit');
    expect(statement.result.response).toBe('graded later, not now');
    expect(statement.result).not.toHaveProperty('score');
    expect(statement.result).not.toHaveProperty('success');
    expect(statement.result).not.toHaveProperty('completion');
  });

  it('ignores a form submit while the textarea is empty', () => {
    const onSubmitted = vi.fn();
    render(<WrittenResponse data={wr()} onSubmitted={onSubmitted} />);
    fireEvent.submit(screen.getByRole('form', { name: 'Essay' }));
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('names the xAPI object in the authored locale', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(<WrittenResponse data={wr({ locale: 'fr-FR' })} onSubmitted={onSubmitted} />);
    await user.type(screen.getByRole('textbox'), 'quelques mots');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    const statement = onSubmitted.mock.calls[0]?.[0].xapiStatement;
    expect(statement.object.definition.name).toEqual({ 'fr-FR': 'Essay' });
  });

  it('reports withinWordBounds false when outside the authored bounds', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(<WrittenResponse data={wr({ minWords: 5, maxWords: 10 })} onSubmitted={onSubmitted} />);
    await user.type(screen.getByRole('textbox'), 'too short');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    const submission = onSubmitted.mock.calls[0]?.[0];
    expect(submission.wordCount).toBe(2);
    expect(submission.withinWordBounds).toBe(false);
  });

  it('locks the form after submit and announces the pending summary', async () => {
    const user = userEvent.setup();
    render(<WrittenResponse data={wr()} onSubmitted={vi.fn()} />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'my final answer');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(textarea).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    const region = document.getElementById('w1-feedback');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent(
      'Response submitted. It will be graded and your result will appear here later.',
    );
  });

  it('fires the submitted interaction with word count and bounds payload', async () => {
    const user = userEvent.setup();
    const onInteraction = vi.fn();
    render(<WrittenResponse data={wr()} onSubmitted={vi.fn()} onInteraction={onInteraction} />);
    await user.type(screen.getByRole('textbox'), 'two words');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'submitted',
        activityId: 'w1',
        payload: { wordCount: 2, withinWordBounds: true },
      }),
    );
  });

  it('honours the disabled prop', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(<WrittenResponse data={wr()} onSubmitted={onSubmitted} disabled />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
    await user.type(textarea, 'nope');
    expect(textarea).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('resets when the data prop changes (Req 3.7)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WrittenResponse data={wr()} onSubmitted={vi.fn()} />);
    await user.type(screen.getByRole('textbox'), 'draft text');
    rerender(
      <WrittenResponse data={wr({ id: 'w2', prompt: 'New prompt.' })} onSubmitted={vi.fn()} />,
    );
    expect(screen.getByText('New prompt.')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(document.getElementById('w2-counter')).toHaveTextContent('0 words (2–5 words)');
  });

  it('renders the error boundary fallback for invalid data (dev)', () => {
    render(<WrittenResponse data={wr({ minWords: 5, maxWords: 2 })} onSubmitted={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has no axe violations before and after submission', async () => {
    const user = userEvent.setup();
    const { container } = render(<WrittenResponse data={wr()} onSubmitted={vi.fn()} />);
    expect(await checkA11y(container)).toHaveNoViolations();
    await user.type(screen.getByRole('textbox'), 'accessible words');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await checkA11y(container)).toHaveNoViolations();
  });
});
