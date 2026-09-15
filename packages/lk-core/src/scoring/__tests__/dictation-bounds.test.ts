import { describe, expect, it } from 'vitest';
import { validateDraft, validateItemGroupDraft } from '../../authoring/index.js';
import { dictationType } from '../../registry/index.js';
import { validateActivity, validateItemGroup } from '../../schemas/index.js';
import type { DictationData, DictationLearnerResponse } from '../../types/activity.js';
import {
  alignDictation,
  DICTATION_MAX_EQUIVALENCES,
  DICTATION_MAX_TEXT_LENGTH,
  evaluate,
  score,
} from '../index.js';

/** `count` copies of `word`, one space apart. */
const repeated = (word: string, count: number): string =>
  Array.from({ length: count }, () => word).join(' ');

const item = (over: Record<string, unknown> = {}): DictationData =>
  ({
    schemaVersion: '1.0',
    type: 'dictation',
    id: 'dc-bounds',
    title: 'Listen and type',
    transcript: 'hello world',
    ...over,
  }) as unknown as DictationData;

const typed = (text: string): DictationLearnerResponse => ({ type: 'dictation', text });

const rules = (...pairs: (readonly [string, string])[]) => ({
  equivalences: pairs.map(([from, to]) => ({ from, to })),
});

const paths = (result: ReturnType<typeof validateActivity>): string[] =>
  result.success ? [] : result.errors.map((error) => error.path.join('.'));

const draftIssues = (data: unknown): [string, string][] =>
  validateDraft('dictation', data).issues.map((found) => [found.code, found.path.join('.')]);

/**
 * Inputs that used to exhaust memory or throw from a regular expression, found
 * by executing the built package. Each case finishing at all is most of the
 * assertion: the unbounded normaliser crashed the process on the first three.
 */
describe('dictation — bounded on any input', () => {
  it.each<[string, (readonly [string, string])[], string]>([
    ['one rule four times over one letter', Array(4).fill(['a', repeated('a', 100)]), 'a'],
    [
      'three chained rules',
      [
        ['a', repeated('b', 100)],
        ['b', repeated('c', 100)],
        ['c', repeated('d', 100)],
      ],
      repeated('a', 200),
    ],
    ['a doubling rule sixteen times', Array(16).fill(['a', 'a a']), repeated('a', 4000)],
  ])('finishes when rules multiply the text: %s', (_label, pairs, text) => {
    const data = item({ transcript: 'a', tolerance: rules(...pairs) });
    const alignment = alignDictation(data, text);
    expect(alignment.truncated).toBe(true);
    expect(Array.from(alignment.attempt).length).toBeLessThanOrEqual(DICTATION_MAX_TEXT_LENGTH);
    expect(evaluate(data, typed(text))).toMatchObject({ status: 'scored' });
  });

  it('cuts working text that one rule grows past its bound without stopping early', () => {
    // 4,000 four-letter words and 3,999 spaces: longer than the working bound,
    // shorter than the point at which the rewrite stops.
    expect(
      alignDictation(item({ tolerance: rules(['a', 'aaaa']) }), repeated('a', 4000)),
    ).toMatchObject({ truncated: true });
  });

  it('validates an item whose rules multiply its transcript by reporting the length', () => {
    const data = item({
      transcript: 'a cat',
      tolerance: rules(...Array<readonly [string, string]>(4).fill(['a', repeated('a', 100)])),
    });
    expect(paths(validateActivity('dictation', data))).toContain('transcript');
    expect(draftIssues(data)).toContainEqual(['dc_transcript_too_long', 'transcript']);
  });

  it('reports a pasted passage as too long instead of throwing, alone and inside a group', () => {
    const passage = 'The quick brown fox jumps over the lazy dog. '.repeat(2500);
    const data = item({ transcript: passage, acceptedTranscripts: [passage.slice(0, 40000)] });
    expect(paths(validateActivity('dictation', data))).toEqual(
      expect.arrayContaining(['transcript', 'acceptedTranscripts']),
    );
    expect(draftIssues(data)).toEqual(
      expect.arrayContaining([
        ['dc_transcript_too_long', 'transcript'],
        ['dc_accepted_transcript_too_long', 'acceptedTranscripts.0'],
      ]),
    );
    const group = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'group',
      title: 'Group',
      stimulus: { id: 'stimulus', kind: 'text', body: 'Read this.' },
      items: [data],
    };
    expect(validateItemGroup(group).success).toBe(false);
    expect(validateItemGroupDraft(group).issues.map((found) => found.code)).toContain(
      'dc_transcript_too_long',
    );
  });

  it('refuses a rule whose `from` is past the length cap, and scores stale data carrying one', () => {
    const data = item({ tolerance: rules(['z'.repeat(40000), 'q']) });
    expect(paths(validateActivity('dictation', data))).toEqual(['tolerance.equivalences.0.from']);
    expect(draftIssues(data)).toEqual([['dc_tolerance_invalid', 'tolerance.equivalences.0.from']]);
    expect(score('dictation', data, typed('hello world')).score).toBe(1);
  });

  it(`refuses more than ${DICTATION_MAX_EQUIVALENCES} rules`, () => {
    const many = Array.from(
      { length: DICTATION_MAX_EQUIVALENCES + 1 },
      (_, index) => [`w${index}`, 'x'] as const,
    );
    const refused = validateActivity('dictation', item({ tolerance: rules(...many) }));
    expect(
      refused.success ? [] : refused.errors.map((error) => [error.path.join('.'), error.message]),
    ).toEqual([
      [
        'tolerance.equivalences',
        `A dictation carries at most ${DICTATION_MAX_EQUIVALENCES} equivalence rules.`,
      ],
    ]);
    expect(draftIssues(item({ tolerance: rules(...many) }))).toEqual([
      ['dc_tolerance_invalid', 'tolerance.equivalences'],
    ]);
    expect(
      validateActivity('dictation', item({ tolerance: rules(...many.slice(1)) })).success,
    ).toBe(true);
  });

  it('treats NEXT LINE as spacing and removes other control characters', () => {
    const nul = String.fromCodePoint(0);
    const nextLine = String.fromCodePoint(0x85);
    expect(alignDictation(item(), `hel${nul}lo${nextLine}world`).similarity).toBe(1);
    // Nothing a learner could type is left of a transcript of control characters.
    expect(paths(validateActivity('dictation', item({ transcript: `${nul}${nul}` })))).toContain(
      'transcript',
    );
    // Nothing but what the normaliser removes before reading a word is not written yet.
    for (const invisible of [0, 0xfeff, 0x85, 0xfe0f, 0x34f, 0x3164, 0x200b]) {
      expect(draftIssues(item({ transcript: String.fromCodePoint(invisible) }))).toEqual([
        ['dc_transcript_required', 'transcript'],
      ]);
    }
    // Punctuation is written, and nothing survives it.
    expect(draftIssues(item({ transcript: '?!' }))).toEqual([
      ['dc_transcript_unscorable', 'transcript'],
    ]);
  });

  it('counts a combining mark as part of its word, for a rule and for the transcript check', () => {
    const eight = String.fromCodePoint(0x906, 0x920);
    const allEight = String.fromCodePoint(0x906, 0x920, 0x94b, 0x902);
    expect(
      alignDictation({ transcript: allEight, tolerance: rules([eight, '8']) }, '8').reference,
    ).toBe(allEight);
    // A title saying "all eight" does not give away a transcript saying "eight".
    expect(
      validateActivity('dictation', item({ transcript: eight, title: `${allEight} days` })).success,
    ).toBe(true);
  });

  it('reads a slow recording whose playback is explicitly undefined as having no policy', () => {
    const data = item({
      media: { type: 'audio', url: 'https://cdn.example/normal.mp3' },
      slowMedia: { type: 'audio', url: 'https://cdn.example/slow.mp3', playback: undefined },
    });
    expect(validateActivity('dictation', data).success).toBe(true);
    expect(draftIssues(data)).toEqual([]);
  });

  it('keeps astral text that is over the cap in UTF-16 units but within it in code points', () => {
    const face = String.fromCodePoint(0x1f600);
    // 4,001 code points, 8,002 UTF-16 units: nothing to cut.
    const alignment = alignDictation({ transcript: face }, face.repeat(4001));
    expect(alignment.truncated).toBe(false);
    expect(Array.from(alignment.attempt)).toHaveLength(4001);
  });

  it('decides whether anything was answered from the text the scorer reads, cut at the cap', () => {
    const text = `${String.fromCodePoint(0x200b).repeat(DICTATION_MAX_TEXT_LENGTH)}hello`;
    expect(dictationType.isAnswered?.(typed(text))).toBe(false);
    expect(alignDictation(item(), text).attempt).toBe('');
  });

  it('inserts a rewrite without its punctuation, so punctuation cannot push words past the cut', () => {
    // A hundred rules each prefixing "x" with 199 dots used to cut the "x" off
    // the transcript and let "y" alone score full marks.
    const data = item({
      transcript: 'y x',
      tolerance: rules(...Array<readonly [string, string]>(100).fill(['x', `${'.'.repeat(199)}x`])),
    });
    expect(validateActivity('dictation', data).success).toBe(true);
    expect(score('dictation', data, typed('y x')).score).toBe(1);
    expect(score('dictation', data, typed('y')).score).toBeLessThan(1);
    // Anything typed stays typed: no rule set turns a word into nothing.
    expect(dictationType.isAnswered?.(typed('x'))).toBe(true);
    expect(alignDictation(data, 'x').attempt).toBe('x');
  });

  it('refuses a transcript whose rules would grow it past the working bound, even if later rules shrink it', () => {
    const data = item({
      transcript: repeated('a', 1000),
      tolerance: rules(['a', repeated('b', 100)], [repeated('b', 100), 'c']),
    });
    expect(paths(validateActivity('dictation', data))).toContain('transcript');
    expect(draftIssues(data)).toContainEqual(['dc_transcript_too_long', 'transcript']);
  });

  it('reports the rule cap in a draft even while a rule has a half to write', () => {
    const many = Array.from(
      { length: DICTATION_MAX_EQUIVALENCES + 1 },
      (_, index) => [`w${index}`, 'x'] as [string, string],
    );
    many[5] = ['', 'x'];
    const result = validateDraft('dictation', item({ tolerance: rules(...many) }));
    expect(result.status).toBe('invalid');
    expect(result.issues.map((found) => [found.code, found.path.join('.')])).toEqual(
      expect.arrayContaining([
        ['dc_tolerance_invalid', 'tolerance.equivalences'],
        ['dc_equivalence_from_required', 'tolerance.equivalences.5.from'],
      ]),
    );
  });

  it('reports a tolerance of the wrong type under the tolerance code', () => {
    for (const tolerance of [5, 'x', []]) {
      expect(draftIssues(item({ tolerance }))).toEqual([['dc_tolerance_invalid', 'tolerance']]);
    }
  });

  it('checks a draft with many malformed rules in linear time', () => {
    const started = performance.now();
    validateDraft('dictation', item({ tolerance: { equivalences: Array(20000).fill(5) } }));
    // Quadratic matching took seconds here; linear matching takes a fraction of one.
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it.each<[string, string, string]>([
    ['a transcript joined to the title by a colon', 'Listen:hello world', 'hello world'],
    ['a transcript after an em dash', 'Listen—hello world', 'hello world'],
    ['a Chinese transcript after a fullwidth colon', '听写：你好', '你好'],
    ['a four-character Chinese transcript run into the title', '听写我爱北京', '我爱北京'],
    ['a Japanese transcript in brackets', 'ディクテーション「こんにちは」', 'こんにちは'],
    ['a Thai transcript after a colon', 'ฟัง:สวัสดี', 'สวัสดี'],
    ['a Thai transcript of four letters and two vowel signs run in', 'ฟังสวัสดีนะ', 'สวัสดี'],
    ['a transcript whose punctuation joins its words', 'Listen: Hello, world', 'Hello,world'],
    [
      'a Korean transcript whose full stop joins two sentences',
      '받아쓰기: 안녕하세요. 감사합니다',
      '안녕하세요.감사합니다',
    ],
    [
      'a Chinese transcript with a space, glued to the title',
      '听写我爱北京 天安门',
      '我爱北京 天安门',
    ],
    [
      'a Chinese transcript with a space, written in the title without it',
      '听写：我爱北京天安门',
      '我爱北京 天安门',
    ],
    ['a Thai transcript of two clauses, run in', 'ฟังสวัสดีครับ ยินดีต้อนรับนะ', 'สวัสดีครับ ยินดีต้อนรับ'],
    ['a mixed Chinese and Latin transcript after a colon', '听写：我爱 Beijing', '我爱 Beijing'],
    [
      'a transcript with an in-word hyphen read as a space',
      'Listen: well-known fact',
      'well known fact',
    ],
    ['a transcript typed in fullwidth digits by an input method', '聞き取り：２０２４年', '2024年'],
    ['a transcript drawn with a Kangxi radical', '听写：中国⼈', '中国人'],
    [
      'a transcript in halfwidth katakana with voicing marks',
      '聞き取り：ｶﾞﾗｽのｺｯﾌﾟ',
      'ガラスのコップ',
    ],
    [
      'a Chinese transcript whose number the title sets apart with spaces',
      '听写：我有 3 本书',
      '我有3本书',
    ],
    [
      'a Chinese transcript that sets its number apart, run into the title',
      '听写：我有3本书',
      '我有 3 本书',
    ],
    [
      'a Japanese transcript whose number the title sets apart',
      '聞き取り：第 3 課の練習',
      '第3課の練習',
    ],
    [
      'a Thai transcript with a Latin word, written without spaces',
      'ฝึกเขียน: ใช้Googleค้นหา',
      'ใช้ Google ค้นหา',
    ],
  ])('refuses a title that reveals %s', (_label, title, transcript) => {
    expect(paths(validateActivity('dictation', item({ title, transcript })))).toContain('title');
    expect(draftIssues(item({ title, transcript }))).toContainEqual([
      'dc_transcript_revealed',
      'title',
    ]);
  });

  it.each<[string, string, string]>([
    ['a Latin word inside a longer word', 'Category practice', 'cat'],
    ['a one-character Chinese transcript inside a word', '你好练习', '好'],
    // Two or three characters of a script written without spaces often spell
    // part of another word, and word edges cannot be seen there.
    ['the Thai for "eye" inside the Thai for "dictation"', 'เขียนตามคำบอก', 'ตา'],
    ['the Thai for "leg" inside the Thai for "white"', 'บทที่ 5 สีขาว', 'ขา'],
    ['the Thai for "come" inside the Thai for "very"', 'ขอบคุณมาก', 'มา'],
    ['the Lao for "eye" inside the Lao for "dictation"', 'ຂຽນຕາມຄຳບອກ', 'ຕາ'],
    ['the Khmer for "eye" inside the Khmer for "dictation"', 'សរសេរតាមអាន', 'តា'],
    ['a Japanese word inside a longer one', '書き取り 第3課', '書き'],
    ['two Chinese characters straddling two words', '第三课：中国人民', '国人'],
    ['two Chinese characters run into the title', '听写你好', '你好'],
    ['a digit and a character inside a longer number', '第11课', '1课'],
    ['a mixed pair inside a Latin word', 'ba中文', 'a中'],
    // Only characters of scripts written without spaces count towards four.
    ['a mixed transcript with two Han characters, run in', '听写我爱 Beijing', '我爱 Beijing'],
    ['a date inside a longer date', '日期听写：12月3日', '2月3日'],
    ['a price inside a longer price', 'Price: 1,100 dollars', '100 dollars'],
    [
      'a price inside a longer price grouped with an apostrophe',
      "Price: 1'100 dollars",
      '100 dollars',
    ],
    ['a Thai price inside a longer Thai price', 'ราคา: ๑,๑๐๐ บาท', '๑๐๐ บาท'],
    ['a Burmese number inside a longer one', 'ဖုန်း ၀၉၁၂၃၄၅၆၇', '၁၂၃၄'],
    ['a Latin word beside a longer Latin word', 'Book 你好', 'OK 你好'],
  ])('accepts a title that only contains %s', (_label, title, transcript) => {
    expect(validateActivity('dictation', item({ title, transcript })).success).toBe(true);
    expect(draftIssues(item({ title, transcript }))).toEqual([]);
  });

  it('looks for a transcript in the title as written too, where a rule rewrites only the title', () => {
    const data = item({
      title: 'Listen: a cat sat',
      transcript: 'cat sat',
      tolerance: rules(['a cat', 'a kitten']),
    });
    expect(paths(validateActivity('dictation', data))).toEqual(['title']);
    // A rule whose match straddles the start of the title's copy.
    const straddled = item({
      title: 'Song: la la la land',
      transcript: 'la la land',
      tolerance: rules(['la la', 'lala']),
    });
    expect(paths(validateActivity('dictation', straddled))).toEqual(['title']);
    expect(draftIssues(straddled)).toEqual([['dc_transcript_revealed', 'title']]);
  });

  it('reads a transcript as written, whichever script its rules rewrite its edges into', () => {
    // Four Han characters are found run into the title, a numeral rule or not.
    const date = item({
      title: '今天是三月三日星期一',
      transcript: '三月三日',
      tolerance: rules(['三', '3']),
    });
    expect(paths(validateActivity('dictation', date))).toEqual(['title']);
    expect(draftIssues(date)).toEqual([['dc_transcript_revealed', 'title']]);
    // Two are not, and a rule that makes the first a digit does not make its edge visible.
    const books = item({ title: '我有两本。', transcript: '两本', tolerance: rules(['两', '2']) });
    expect(validateActivity('dictation', books).success).toBe(true);
    expect(draftIssues(books)).toEqual([]);
  });

  it('reports the dictation guards beside a refusal in another field', () => {
    const data = item({
      title: 'Listen: hello world',
      media: { type: 'audio', url: 'hello.mp3', captionsUrl: '/a.vtt' },
    });
    expect(paths(validateActivity('dictation', data))).toEqual(
      expect.arrayContaining(['media.url', 'title']),
    );
    const refusedLevel = item({ title: 'Listen: hello world', difficultyLevel: 0 });
    expect(paths(validateActivity('dictation', refusedLevel))).toEqual([
      'difficultyLevel',
      'title',
    ]);
    // A refused transcript or title is not text: no guard reads it, and nothing throws.
    const empty = validateActivity('dictation', item({ transcript: '' }));
    expect(
      empty.success ? [] : empty.errors.map((error) => [error.path.join('.'), error.code]),
    ).toEqual([['transcript', 'too_small']]);
    expect(paths(validateActivity('dictation', item({ title: 5, transcript: 5 })))).toEqual([
      'title',
      'transcript',
    ]);
    expect(validateActivity('dictation', null).success).toBe(false);
    expect(validateActivity('dictation', ['dictation']).success).toBe(false);
  });

  it('checks at most ten accepted transcripts in a draft, however many are pasted', () => {
    const title = 'x'.repeat(16_000);
    const data = item({
      title,
      media: { type: 'audio', url: '/a.mp3', alt: title },
      acceptedTranscripts: Array.from({ length: 50_000 }, (_, index) => `entry number ${index}`),
    });
    const started = performance.now();
    const issues = draftIssues(data);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(issues).toEqual([['dc_accepted_transcripts_too_many', 'acceptedTranscripts']]);
    // Past the cap, an empty entry is still named: the schema refuses it there too.
    const withEmpty = item({
      acceptedTranscripts: [...Array.from({ length: 20 }, (_, index) => `entry ${index}`), ''],
    });
    expect(draftIssues(withEmpty)).toEqual([
      ['dc_accepted_transcripts_too_many', 'acceptedTranscripts'],
      ['dc_accepted_transcript_empty', 'acceptedTranscripts.20'],
    ]);
  });

  it('reads a transcript over the cap as written, whatever it holds', () => {
    expect(draftIssues(item({ transcript: ' '.repeat(3000) }))).toEqual([
      ['dc_transcript_too_long', 'transcript'],
    ]);
    expect(draftIssues(item({ transcript: String.fromCodePoint(0x200b).repeat(3000) }))).toEqual([
      ['dc_transcript_too_long', 'transcript'],
    ]);
  });

  it('says how the rules count towards the length of an accepted transcript', () => {
    const data = item({
      acceptedTranscripts: [`${'y'.repeat(1997)} q`],
      tolerance: rules(['q', 'qqq']),
    });
    const result = validateActivity('dictation', data);
    expect(result.success ? [] : result.errors.map((error) => error.message)).toEqual([
      'An accepted transcript must contain something to type and be at most 2000 characters, before and after its equivalences are applied, and its equivalences may not grow it past 16000 characters on the way.',
    ]);
  });

  it('checks a flag with a tag run as long as a title may be in linear time', () => {
    const flag = `${String.fromCodePoint(0x1f3f4)}${String.fromCodePoint(0xe0067).repeat(15_999)}`;
    const data = item({ title: flag, media: { type: 'audio', url: '/a.mp3', alt: flag } });
    const started = performance.now();
    expect(validateActivity('dictation', data).success).toBe(true);
    // A walk back over every earlier tag, per tag, took seconds here.
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('runs no guard on a field zod left out for a refusal inside it', () => {
    // An unfinished rule makes zod drop the whole tolerance from what the
    // guards read; the rule that rescues the transcript must not read as absent.
    const rescued = item({
      title: 'Symbols',
      transcript: '&',
      tolerance: rules(['&', 'and'], ['%', '']),
    });
    expect(paths(validateActivity('dictation', rescued))).toEqual(['tolerance.equivalences.1.to']);
    expect(draftIssues(rescued)).toEqual([
      ['dc_equivalence_to_required', 'tolerance.equivalences.1.to'],
    ]);
    expect(validateDraft('dictation', rescued).status).toBe('incomplete');
    // An empty description drops the recording; the slow one still has it.
    const described = item({
      media: { type: 'audio', url: '/a.mp3', alt: '' },
      slowMedia: { type: 'audio', url: '/b.mp3' },
    });
    expect(paths(validateActivity('dictation', described))).toEqual(['media.alt']);
  });

  it('finds a transcript in linear time, however a title repeats it', () => {
    const letter = (index: number) => String.fromCharCode(97 + (index % 26));
    const heavy = (index: number) => {
      const l = letter(index);
      return item({
        id: `dc-${index}`,
        title: `${l.repeat(8000)}.${l.repeat(7999 - (index % 10))}`,
        transcript: `${l.repeat(1000 - (index % 40))}.${l.repeat(999)}`,
        acceptedTranscripts: Array.from(
          { length: 10 },
          (_, k) => `${l.repeat(999 - (index % 40) - k)}.${l.repeat(999)}`,
        ),
        media: { type: 'audio', url: '/a.mp3', alt: `${l.repeat(8000)}.${l.repeat(7998)}` },
      });
    };
    const group = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'group',
      stimulus: { id: 'stimulus', kind: 'text', body: 'Read this.' },
      items: Array.from({ length: 10 }, (_, index) => heavy(index)),
    };
    const started = performance.now();
    expect(validateItemGroupDraft(group).status).toBe('complete');
    // A search that restarted after every rejected occurrence took twenty seconds here.
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it('refuses a title or description too long to be searched in full, raw or once its rules apply', () => {
    const revealedLate = `${'Listen carefully. '.repeat(900)}It isn't raining in Lisbon today`;
    const data = item({ title: revealedLate, transcript: "It isn't raining in Lisbon today" });
    expect(paths(validateActivity('dictation', data))).toEqual(['title']);
    expect(draftIssues(data)).toEqual([['dc_shown_text_too_long', 'title']]);

    const alt = `${'Recording. '.repeat(1500)}It isn't raining`;
    const withAlt = item({
      transcript: "It isn't raining",
      media: { type: 'audio', url: '/a.mp3', alt },
    });
    expect(paths(validateActivity('dictation', withAlt))).toEqual(['media.alt']);
    expect(draftIssues(withAlt)).toContainEqual(['dc_shown_text_too_long', 'media.alt']);

    // One `a` grows to 199 characters: 80 of them stay within 16,000, 81 do not.
    const growth = rules(['a', repeated('b', 100)]);
    const within = item({ title: repeated('a', 80), tolerance: growth });
    expect(validateActivity('dictation', within).success).toBe(true);
    const past = item({ title: repeated('a', 81), tolerance: growth });
    expect(paths(validateActivity('dictation', past))).toEqual(['title']);
    expect(draftIssues(past)).toContainEqual(['dc_shown_text_too_long', 'title']);
  });

  it('compares text as its letters: variation selectors, composition and symbols between letters', () => {
    const heart = String.fromCodePoint(0x2764);
    const selector = String.fromCodePoint(0xfe0f);
    expect(
      alignDictation({ transcript: `i ${heart} you` }, `i ${heart}${selector} you`).similarity,
    ).toBe(1);
    // A rule reads text already composed: U+01F0 and J + COMBINING CARON are the same letter.
    const jCaron = String.fromCodePoint(0x1f0);
    expect(
      alignDictation(
        { transcript: 'jay', tolerance: rules([jCaron, 'jay']) },
        `J${String.fromCodePoint(0x30c)}`,
      ).similarity,
    ).toBe(1);
    // A rule that names a symbol fires where the symbol touches letters, and
    // its rewrite is set apart from them as a word.
    expect(
      alignDictation({ transcript: 'x', tolerance: rules(['&', 'and']) }, 'rock&roll').attempt,
    ).toBe('rock and roll');
  });

  it('reads at most ten accepted transcripts from stale data, and cuts a stale transcript before normalising it', () => {
    const decoys = Array.from({ length: 10 }, (_, index) => `decoy${index}`);
    expect(
      alignDictation({ transcript: 'zzz', acceptedTranscripts: [...decoys, 'x'] }, 'x').similarity,
    ).toBe(0);
    expect(
      alignDictation({ transcript: 'zzz', acceptedTranscripts: [...decoys.slice(1), 'x'] }, 'x')
        .candidateIndex,
    ).toBe(10);
    const huge = `${'hello '.repeat(1_000_000)}`;
    expect(alignDictation({ transcript: huge }, 'hello').candidateIndex).toBe(0);
  });

  it('refuses captions on a group stimulus that a dictation without a recording plays', () => {
    const group = (dictation: Record<string, unknown>) => ({
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'group',
      title: 'Listen',
      stimulus: {
        id: 'stimulus',
        kind: 'audio',
        media: {
          type: 'audio',
          url: 'https://cdn.example/story.mp3',
          captionsUrl: 'https://cdn.example/story.vtt',
        },
      },
      items: [item(dictation)],
    });
    const played = group({});
    const result = validateItemGroup(played);
    expect(result.success ? [] : result.errors.map((error) => error.path.join('.'))).toEqual([
      'stimulus.media.captionsUrl',
    ]);
    expect(
      validateItemGroupDraft(played).issues.map((found) => [found.code, found.path.join('.')]),
    ).toEqual([['dc_captions_not_allowed', 'stimulus.media.captionsUrl']]);
    // A dictation with its own recording does not play the captioned one.
    const own = group({ media: { type: 'audio', url: 'https://cdn.example/sentence.mp3' } });
    expect(validateItemGroup(own).success).toBe(true);
  });
});

describe('score() and evaluate() check the rounding option', () => {
  const data = item({ transcript: 'hello' });

  it('read `null` as no policy', () => {
    expect(score('dictation', data, typed('hello'), { rounding: null as never }).passed).toBe(true);
    expect(evaluate(data, typed('hello'), { rounding: null as never })).toMatchObject({
      status: 'scored',
      passed: true,
    });
  });

  it.each<[string, unknown]>([
    ['a policy without dp', { mode: 'half-up' }],
    ['an unknown mode', { mode: 'bogus', dp: 2 }],
    ['a fractional dp', { mode: 'floor', dp: 1.5 }],
    ['a negative dp', { mode: 'ceil', dp: -1 }],
    ['a dp past 15', { mode: 'half-even', dp: 16 }],
    ['a dp given as a string', { mode: 'half-up', dp: '2' }],
    ['a mode name alone', 'half-up'],
    ['a BigInt dp', { mode: 'half-up', dp: 2n }],
    [
      'a policy that refers to itself',
      (() => {
        const policy: Record<string, unknown> = { mode: 'nearest' };
        policy.self = policy;
        return policy;
      })(),
    ],
  ])('throw a RangeError for %s instead of failing a perfect score', (_label, rounding) => {
    expect(() => score('dictation', data, typed('hello'), { rounding: rounding as never })).toThrow(
      RangeError,
    );
    expect(() => evaluate(data, typed('hello'), { rounding: rounding as never })).toThrow(
      RangeError,
    );
  });

  it.each<[string, unknown, string]>([
    ['a string mode and a missing dp', { mode: 'nearest' }, 'mode "nearest", dp undefined'],
    ['a number dp', { mode: 'floor', dp: 1.5 }, 'mode "floor", dp 1.5'],
    [
      'an object mode and a BigInt dp',
      { mode: { name: 'floor' }, dp: 2n },
      'mode an object, dp a bigint',
    ],
    ['a mode name alone', 'half-up', 'mode undefined, dp undefined'],
  ])('name what is wrong with %s without serialising it', (_label, rounding, named) => {
    expect(() => score('dictation', data, typed('hello'), { rounding: rounding as never })).toThrow(
      `Invalid rounding policy (${named}): expected { mode: 'half-up' | 'half-even' | 'floor' | 'ceil', dp: a whole number from 0 to 15 }.`,
    );
  });

  it('compare with the policy as it was checked, however often an accessor is read', () => {
    let reads = 0;
    const shifting = {
      mode: 'half-up',
      get dp() {
        reads += 1;
        return reads === 1 ? 2 : undefined;
      },
    };
    expect(score('dictation', data, typed('hello'), { rounding: shifting as never })).toMatchObject(
      {
        score: 1,
        passed: true,
      },
    );
    expect(reads).toBe(1);

    let modeReads = 0;
    const flipping = {
      dp: 0,
      get mode() {
        modeReads += 1;
        return modeReads === 1 ? 'floor' : 'ceil';
      },
    };
    // floor(0.3) meets 0, ceil(0.3) does not: the checked mode, floor, is the one applied.
    const lowBar = item({ transcript: 'hello', passThreshold: 0.3 });
    expect(score('dictation', lowBar, typed(''), { rounding: flipping as never }).passed).toBe(
      true,
    );
    expect(modeReads).toBe(1);
  });

  it('accept dp from 0 to 15', () => {
    for (const dp of [0, 15]) {
      expect(
        score('dictation', data, typed('hello'), { rounding: { mode: 'floor', dp } }).passed,
      ).toBe(true);
    }
  });
});
