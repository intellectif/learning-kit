import { describe, expect, it } from 'vitest';
import { validateDraft } from '../../authoring/index.js';
import { redact } from '../../redact.js';
import { score } from '../../scoring/index.js';
import type { MultipleChoiceData } from '../../types/activity.js';
import { validateActivity } from '../index.js';

/** A picture-choice item: the A1/A2 vocabulary question this feature exists for. */
const pictureChoice: MultipleChoiceData = {
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'q1',
  title: 'Animals',
  question: 'Which picture shows a cat?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  options: [
    {
      id: 'a',
      text: 'Picture 1',
      isCorrect: true,
      media: { type: 'image', url: 'https://cdn.example.com/cat.png', alt: 'a small tabby cat' },
    },
    {
      id: 'b',
      text: 'Picture 2',
      isCorrect: false,
      media: { type: 'image', url: '/media/dog.png', alt: 'a brown dog' },
    },
  ],
};

/** A minimal-pair listening item: the other half of the use case. */
const listening: MultipleChoiceData = {
  ...pictureChoice,
  id: 'q2',
  question: 'Which recording says "ship"?',
  options: [
    {
      id: 'a',
      text: 'Recording 1',
      isCorrect: true,
      media: { type: 'audio', url: 'https://cdn.example.com/ship.mp3' },
    },
    {
      id: 'b',
      text: 'Recording 2',
      isCorrect: false,
      media: {
        type: 'audio',
        url: 'https://cdn.example.com/sheep.mp3',
        captionsUrl: '/captions/sheep.vtt',
      },
    },
  ],
};

const withOptionMedia = (media: unknown): unknown => ({
  ...pictureChoice,
  options: [{ ...pictureChoice.options[0], media }, pictureChoice.options[1]],
});

describe('multiple-choice option media — what is accepted', () => {
  it('accepts a picture on every option', () => {
    expect(validateActivity('multiple-choice', pictureChoice).success).toBe(true);
  });

  it('accepts a recording, with alt optional and captions allowed', () => {
    expect(validateActivity('multiple-choice', listening).success).toBe(true);
  });

  it('keeps a consumer sidecar on an option’s media, like every other content schema', () => {
    const result = validateActivity(
      'multiple-choice',
      withOptionMedia({
        type: 'image',
        url: '/a.png',
        alt: 'a cat',
        assetId: 'cms-4491',
      }),
    );
    expect(result.success).toBe(true);
    const options = result.success
      ? (result.data.options as unknown as { media?: Record<string, unknown> }[])
      : [];
    expect(options[0]?.media?.assetId).toBe('cms-4491');
  });
});

describe('multiple-choice option media — what is refused, and why', () => {
  it('refuses an embed: an iframe swallows the click that selects the option', () => {
    const result = validateActivity(
      'multiple-choice',
      withOptionMedia({ type: 'embed', url: 'https://www.youtube.com/embed/abc', alt: 'a clip' }),
    );
    expect(result.success).toBe(false);
  });

  it('refuses a video, whose control bar eats the same click', () => {
    const result = validateActivity(
      'multiple-choice',
      withOptionMedia({ type: 'video', url: 'https://cdn.example.com/clip.mp4', alt: 'a clip' }),
    );
    expect(result.success).toBe(false);
  });

  it('refuses a playback policy rather than ignoring one', () => {
    // The failure this prevents: a listening paper that believes each option is
    // capped at two plays while nothing counts them.
    const result = validateActivity(
      'multiple-choice',
      withOptionMedia({ type: 'audio', url: '/a.mp3', playback: { maxPlays: 2 } }),
    );
    expect(result.success).toBe(false);
  });

  it('requires a non-empty alt on a picture, so an option is never silently unreadable', () => {
    expect(
      validateActivity('multiple-choice', withOptionMedia({ type: 'image', url: '/a.png' }))
        .success,
    ).toBe(false);
    expect(
      validateActivity(
        'multiple-choice',
        withOptionMedia({ type: 'image', url: '/a.png', alt: '' }),
      ).success,
    ).toBe(false);
  });

  it('applies the same URL allow-list as activity media, not a forked one', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://host/a.png']) {
      expect(
        validateActivity('multiple-choice', withOptionMedia({ type: 'image', url, alt: 'x' }))
          .success,
      ).toBe(false);
    }
  });
});

describe('multiple-choice option media — drafts', () => {
  it('reports an unfinished option picture with the codes media already uses', () => {
    const result = validateDraft(
      'multiple-choice',
      withOptionMedia({ type: 'image', url: '', alt: '' }),
    );
    expect(result.status).toBe('incomplete');
    const codes = result.issues.map((found) => found.code);
    expect(codes).toContain('media_url_required');
    expect(codes).toContain('media_alt_required');
    // Reported under the option, not at the activity's own media block.
    const paths = result.issues.map((found) => found.path.join('.'));
    expect(paths).toContain('options.0.media.url');
  });

  it('explains a video option instead of passing zod’s enum message through', () => {
    const result = validateDraft(
      'multiple-choice',
      withOptionMedia({ type: 'video', url: '/a.mp4', alt: 'a clip' }),
    );
    expect(result.status).toBe('invalid');
    const kind = result.issues.find((found) => found.code === 'mc_option_media_kind');
    expect(kind?.path).toEqual(['options', '0', 'media', 'type']);
    expect(kind?.message).toContain('swallow the click');
  });

  it('reports a refused option address as invalid, not as unfinished', () => {
    const result = validateDraft(
      'multiple-choice',
      withOptionMedia({ type: 'image', url: 'javascript:alert(1)', alt: 'x' }),
    );
    expect(result.status).toBe('invalid');
    expect(result.issues.map((found) => found.code)).toContain('media_url_invalid');
  });
});

describe('multiple-choice option media — redaction and scoring', () => {
  it('keeps the picture the learner has to look at, and still removes the key', () => {
    const redacted = redact(pictureChoice) as Record<string, unknown>;
    const options = redacted.options as { text: string; media?: { url: string } }[];
    // Strip the media and the exam is two identical blank rows.
    expect(options.map((option) => option.media?.url)).toEqual([
      'https://cdn.example.com/cat.png',
      '/media/dog.png',
    ]);
    for (const option of options as unknown as Record<string, unknown>[]) {
      expect(option).not.toHaveProperty('isCorrect');
    }
  });

  it('scores a picture-choice item on ids, exactly as a text option', () => {
    const result = score('multiple-choice', pictureChoice, {
      type: 'multiple-choice',
      selectedOptionIds: ['a'],
    });
    expect(result.score).toBe(1);
  });
});
