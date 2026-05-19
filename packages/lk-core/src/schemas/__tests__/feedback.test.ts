import { describe, expect, it } from 'vitest';
import { FeedbackSchema, validateActivity } from '../index.js';

describe('FeedbackSchema', () => {
  it('accepts partial, full, and empty feedback objects', () => {
    expect(FeedbackSchema.safeParse({}).success).toBe(true);
    expect(FeedbackSchema.safeParse({ correct: 'Nice!' }).success).toBe(true);
    expect(FeedbackSchema.safeParse({ correct: 'A', incorrect: 'B' }).success).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(FeedbackSchema.safeParse({ correct: '' }).success).toBe(false);
  });

  it('is optional on activity data and validates when present', () => {
    const r = validateActivity('fill-in-the-blanks', {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'f',
      title: 'T',
      passage: 'a {{x}} b',
      blanks: [{ id: 'x', acceptedAnswers: ['y'] }],
      scoringStrategy: 'partial',
      feedback: { correct: 'Great!', incorrect: 'Review the passage.' },
    });
    expect(r.success).toBe(true);
  });

  it('allows optional per-blank feedback on Fill-in-the-Blanks', () => {
    const r = validateActivity('fill-in-the-blanks', {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'f',
      title: 'T',
      passage: 'a {{x}} b',
      blanks: [{ id: 'x', acceptedAnswers: ['y'], feedback: 'Think about the context.' }],
      scoringStrategy: 'partial',
    });
    expect(r.success).toBe(true);
  });
});
