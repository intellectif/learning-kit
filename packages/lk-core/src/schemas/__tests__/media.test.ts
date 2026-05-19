import { describe, expect, it } from 'vitest';
import { MediaSchema, validateActivity } from '../index.js';

describe('MediaSchema', () => {
  it('accepts image with non-empty alt, audio, and video', () => {
    expect(
      MediaSchema.safeParse({ type: 'image', url: 'https://x.test/a.png', alt: 'A diagram' })
        .success,
    ).toBe(true);
    expect(MediaSchema.safeParse({ type: 'audio', url: 'https://x.test/a.mp3' }).success).toBe(
      true,
    );
    expect(
      MediaSchema.safeParse({
        type: 'video',
        url: 'https://x.test/v.mp4',
        captionsUrl: 'https://x.test/v.vtt',
      }).success,
    ).toBe(true);
  });

  it('rejects an image without alt text (WCAG 1.1.1)', () => {
    expect(MediaSchema.safeParse({ type: 'image', url: 'https://x.test/a.png' }).success).toBe(
      false,
    );
    expect(
      MediaSchema.safeParse({ type: 'image', url: 'https://x.test/a.png', alt: '' }).success,
    ).toBe(false);
  });

  it('rejects a non-URL source and an invalid type', () => {
    expect(MediaSchema.safeParse({ type: 'audio', url: 'not-a-url' }).success).toBe(false);
    expect(MediaSchema.safeParse({ type: 'gif', url: 'https://x.test/a.gif' }).success).toBe(false);
  });

  it('is optional on activity data and validates when present', () => {
    const r = validateActivity('multiple-choice', {
      schemaVersion: '1.0',
      type: 'multiple-choice',
      id: 'q',
      title: 'T',
      question: 'Q?',
      mode: 'single',
      scoringStrategy: 'all-or-nothing',
      media: { type: 'image', url: 'https://x.test/a.png', alt: 'pic' },
      options: [
        { id: 'a', text: 'A', isCorrect: true },
        { id: 'b', text: 'B', isCorrect: false },
      ],
    });
    expect(r.success).toBe(true);
  });
});
