import { describe, expect, it } from 'vitest';
import { critiqueDraft, critiqueDrafts, critiqueItemGroupDraft } from '../index.js';

/** The recording rules' findings alone, as `[code, path]`. */
const recordingCodes = (found: { code: string; path: string[] }[]) =>
  found.filter((one) => one.code.startsWith('media_')).map((one) => [one.code, one.path.join('.')]);

const mc = (media: Record<string, unknown>, optionMedia?: Record<string, unknown>) => ({
  schemaVersion: '1.0',
  type: 'multiple-choice',
  id: 'mc',
  title: 'Q',
  question: 'Where does the train leave from?',
  mode: 'single',
  scoringStrategy: 'all-or-nothing',
  media,
  options: [
    { id: 'a', text: 'Platform 4', isCorrect: true },
    {
      id: 'b',
      text: 'Platform 9',
      isCorrect: false,
      ...(optionMedia ? { media: optionMedia } : {}),
    },
  ],
});

const DIALOGUE = [
  { speaker: 'Anna', text: 'Where does the train leave from?' },
  { speaker: 'Ben', text: 'Platform four.' },
];

describe('the recording rules', () => {
  it('say nothing of a recording whose transcript and script agree, speaker labels aside', () => {
    const agreeing = {
      type: 'audio',
      url: '/a.mp3',
      transcript: 'Anna: Where does the train leave from?\nBen: Platform four!',
      script: DIALOGUE,
    };
    expect(recordingCodes(critiqueDraft('multiple-choice', mc(agreeing)))).toEqual([]);
    // Labels written inline, and in another case, are labels too.
    const inline = {
      ...agreeing,
      transcript: 'ANNA: where does the train leave from? ben: Platform four.',
    };
    expect(recordingCodes(critiqueDraft('multiple-choice', mc(inline)))).toEqual([]);
  });

  it('report a script that says other words, on an item’s media and on an option’s', () => {
    const differing = {
      type: 'audio',
      url: '/a.mp3',
      transcript: 'Anna: Where does the train leave from? Ben: Platform nine.',
      script: DIALOGUE,
    };
    expect(recordingCodes(critiqueDraft('multiple-choice', mc(differing, differing)))).toEqual([
      ['media_script_differs', 'media.script'],
      ['media_script_differs', 'options.1.media.script'],
    ]);
  });

  it('report a transcript or a script on a picture or an embed, which nothing reads', () => {
    const picture = { type: 'image', url: '/p.png', alt: 'A station', transcript: 'A station.' };
    expect(recordingCodes(critiqueDraft('multiple-choice', mc(picture)))).toEqual([
      ['media_transcript_unused', 'media.transcript'],
    ]);
    const player = {
      type: 'embed',
      url: 'https://www.youtube.com/embed/x',
      alt: 'Film',
      script: DIALOGUE,
    };
    expect(recordingCodes(critiqueDraft('multiple-choice', mc(player)))).toEqual([
      ['media_transcript_unused', 'media.script'],
    ]);
    expect(
      recordingCodes(
        critiqueDraft('multiple-choice', mc({ type: 'audio', url: '/a.mp3', transcript: 'Hi.' })),
      ),
    ).toEqual([]);
  });

  it('report a dictation or a read-aloud whose recording says other words than the item', () => {
    const dictation = (media: Record<string, unknown>) => ({
      schemaVersion: '1.0',
      type: 'dictation',
      id: 'd',
      title: 'Type it',
      transcript: "It isn't raining in Lisbon.",
      acceptedTranscripts: ['It is not raining in Lisbon.'],
      media: { type: 'audio', url: '/d.mp3', ...media },
    });
    // Dictation has no rules of its own; the recording rules still run.
    expect(
      recordingCodes(
        critiqueDraft('dictation', dictation({ transcript: 'it isn’t RAINING in lisbon' })),
      ),
    ).toEqual([]);
    expect(
      recordingCodes(
        critiqueDraft('dictation', dictation({ transcript: 'It is not raining in Lisbon.' })),
      ),
    ).toEqual([]);
    expect(
      recordingCodes(
        critiqueDraft('dictation', dictation({ transcript: 'It is raining in Porto.' })),
      ),
    ).toEqual([['media_transcript_differs', 'media.transcript']]);
    const readAloud = {
      schemaVersion: '1.0',
      type: 'read-aloud',
      id: 'r',
      title: 'Read it',
      referenceText: 'the cat sat on the mat',
      locale: 'en-US',
      recording: { maxSeconds: 30 },
      scoring: { dimensions: [{ name: 'accuracy', weight: 1 }] },
      media: {
        type: 'audio',
        url: '/r.mp3',
        script: [{ speaker: 'Model', text: 'The dog sat on the mat.' }],
      },
    };
    expect(recordingCodes(critiqueDraft('read-aloud', readAloud))).toEqual([
      ['media_transcript_differs', 'media.script'],
    ]);
  });

  it('read a group’s material: its own transcript against its script, and its media', () => {
    const group = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'g',
      stimulus: {
        id: 's',
        kind: 'audio',
        media: {
          type: 'audio',
          url: '/s.mp3',
          transcript: 'Hello.',
          script: [{ speaker: 'A', text: 'Goodbye.' }],
        },
        transcript: 'Anna: Where does the train leave from? Ben: Platform four.',
        script: [{ speaker: 'Anna', text: 'Where does the train leave from?' }],
      },
      items: [mc({ type: 'audio', url: '/a.mp3' })],
    };
    expect(recordingCodes(critiqueItemGroupDraft(group))).toEqual([
      ['media_script_differs', 'stimulus.script'],
      ['media_script_differs', 'stimulus.media.script'],
    ]);
    expect(recordingCodes(critiqueDrafts([mc({ type: 'audio', url: '/a.mp3' }), group]))).toEqual([
      ['media_script_differs', '1.stimulus.script'],
      ['media_script_differs', '1.stimulus.media.script'],
    ]);
  });
});
