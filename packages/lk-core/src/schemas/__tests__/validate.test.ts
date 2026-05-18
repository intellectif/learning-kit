import { describe, expect, it } from 'vitest';
import { fillInTheBlanksJsonSchema, multipleChoiceJsonSchema, validateActivity } from '../index.js';

describe('validateActivity (example-based branch coverage)', () => {
  it('returns typed data for a valid multiple-choice activity', () => {
    const r = validateActivity('multiple-choice', {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'q',
      title: 'T',
      question: 'Q?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.id).toBe('q');
    }
  });

  it('maps Zod issues to ValidationError[] for an invalid activity', () => {
    const r = validateActivity('multiple-choice', { type: 'multiple-choice' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors[0]).toMatchObject({
        path: expect.any(Array),
        message: expect.any(String),
        code: expect.any(String),
      });
    }
  });

  it('validates fill-in-the-blanks (success and failure)', () => {
    const ok = validateActivity('fill-in-the-blanks', {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'f',
      title: 'T',
      passage: 'a {{x}} b',
      blanks: [{ id: 'x', acceptedAnswers: ['y'] }],
      scoringStrategy: 'partial',
    });
    expect(ok.success).toBe(true);
    const bad = validateActivity('fill-in-the-blanks', {
      schemaVersion: '1.0',
      type: 'fill-in-the-blanks',
      id: 'f',
      title: 'T',
      passage: 'no placeholder',
      blanks: [{ id: 'x', acceptedAnswers: ['y'] }],
      scoringStrategy: 'partial',
    });
    expect(bad.success).toBe(false);
  });

  it('exports Draft-7 JSON Schemas for both activity types', () => {
    expect(multipleChoiceJsonSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(fillInTheBlanksJsonSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(multipleChoiceJsonSchema.required).toContain('options');
    expect(fillInTheBlanksJsonSchema.required).toContain('blanks');
  });
});
