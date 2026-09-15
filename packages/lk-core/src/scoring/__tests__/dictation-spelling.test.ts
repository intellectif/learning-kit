import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateActivity } from '../../schemas/index.js';
import { normalizeDictationText, preStripNormalize } from '../dictation/normalize.js';
import { alignDictation } from '../index.js';

const cp = (...points: number[]): string => String.fromCodePoint(...points);

const ZWNJ = cp(0x200c);
const ZWJ = cp(0x200d);
const MVS = cp(0x180e);
const FVS1 = cp(0x180b);
const FVS2 = cp(0x180c);
const TAG_B = cp(0xe0062);
const BLACK_FLAG = cp(0x1f3f4);
const KEYCAP = cp(0x20e3);
const VS16 = cp(0xfe0f);
const MIDDLE_DOT = cp(0xb7);
const TSHEG = cp(0xf0b);
const TATWEEL = cp(0x640);

const rules = (...pairs: (readonly [string, string])[]) => ({
  equivalences: pairs.map(([from, to]) => ({ from, to })),
});

const dictation = (over: Record<string, unknown>) => ({
  schemaVersion: '1.0',
  type: 'dictation',
  id: 'dc',
  title: 'Listen and type',
  transcript: 'x',
  ...over,
});

describe('dictation normalisation keeps what is spelling', () => {
  it('keeps the Persian half-space, so the joined and the spaced spelling each cost an edit', () => {
    const mi = cp(0x645, 0x6cc);
    const khaham = cp(0x62e, 0x648, 0x627, 0x647, 0x645);
    const ketab = cp(0x6a9, 0x62a, 0x627, 0x628);
    const ha = cp(0x647, 0x627);
    for (const [prefix, stem] of [
      [mi, khaham],
      [ketab, ha],
    ] as const) {
      const transcript = `${prefix}${ZWNJ}${stem}`;
      expect(alignDictation({ transcript }, transcript).similarity).toBe(1);
      expect(alignDictation({ transcript }, `${prefix}${stem}`).similarity).toBeLessThan(1);
      expect(alignDictation({ transcript }, `${prefix} ${stem}`).similarity).toBeLessThan(1);
      // The joined misspelling can now be listed as an accepted alternative.
      expect(
        validateActivity(
          'dictation',
          dictation({ transcript, acceptedTranscripts: [`${prefix}${stem}`] }),
        ).success,
      ).toBe(true);
    }
  });

  it('removes a joiner that joins nothing: beside a space, at an edge, or inside an emoji sequence', () => {
    expect(normalizeDictationText(`${ZWNJ}ab${ZWJ} ${ZWNJ}c${ZWJ}`)).toBe('ab c');
    expect(normalizeDictationText(`a${ZWJ}${ZWJ}b`)).toBe('ab');
    const face = cp(0x1f600);
    expect(normalizeDictationText(`${face}${ZWJ}${face}`)).toBe(`${face}${face}`);
    // Beside a punctuation mark or a digit, a joiner changes nothing drawn.
    expect(normalizeDictationText(`a${ZWNJ}1`)).toBe('a1');
  });

  it('keeps the Mongolian vowel separator between letters and a free variation selector after one', () => {
    const nom = cp(0x1828, 0x1823, 0x182e);
    const a = cp(0x1820);
    const ga = cp(0x182d);
    expect(normalizeDictationText(`${nom}${MVS}${a}`)).toBe(`${nom}${MVS}${a}`);
    expect(normalizeDictationText(`${ga}${FVS1}`)).not.toBe(normalizeDictationText(`${ga}${FVS2}`));
    // A selector follows a letter, not another selector.
    expect(normalizeDictationText(`${ga}${FVS1}${FVS2}`)).toBe(`${ga}${FVS1}`);
    // With no letter before it, a selector is removed, and so is one after it.
    expect(normalizeDictationText(`a ${FVS1}${FVS2}b`)).toBe('a b');
    // A selector is not a mark a joiner may stand beside.
    expect(normalizeDictationText(`${ga}${FVS1}${ZWJ}${ga}`)).toBe(`${ga}${FVS1}${ga}`);
  });

  it('keeps the tag characters that spell a subdivision flag, and nowhere else', () => {
    const tagged = (letters: string) =>
      cp(0x1f3f4, ...[...letters].map((letter) => 0xe0000 + letter.charCodeAt(0)), 0xe007f);
    const scotland = tagged('gbsct');
    const wales = tagged('gbwls');
    expect(normalizeDictationText(scotland)).toBe(scotland);
    expect(normalizeDictationText(scotland)).not.toBe(normalizeDictationText(wales));
    expect(normalizeDictationText(scotland)).not.toBe(normalizeDictationText(BLACK_FLAG));
    expect(normalizeDictationText(`a${TAG_B}b`)).toBe('ab');
    expect(normalizeDictationText(`${BLACK_FLAG} ${TAG_B}`)).toBe(BLACK_FLAG);
    expect(
      validateActivity(
        'dictation',
        dictation({ transcript: scotland, acceptedTranscripts: [wales] }),
      ).success,
    ).toBe(true);
  });

  it('keeps the base of a keycap, and removes a lone number sign as punctuation', () => {
    expect(normalizeDictationText(`#${VS16}${KEYCAP}`)).toBe(`#${KEYCAP}`);
    expect(normalizeDictationText(`*${VS16}${KEYCAP}`)).toBe(`*${KEYCAP}`);
    expect(normalizeDictationText('#1 & *')).toBe('1');
  });

  it('keeps a middle dot and a tsheg inside a word, and removes them between words', () => {
    expect(normalizeDictationText(`Col${MIDDLE_DOT}legi`)).toBe(`col${MIDDLE_DOT}legi`);
    expect(normalizeDictationText(`a ${MIDDLE_DOT} b${MIDDLE_DOT}`)).toBe('a b');
    const tashi = cp(0xf56, 0xf40, 0xfb2, 0xf0b, 0xf64, 0xf72, 0xf66);
    expect(normalizeDictationText(tashi)).toBe(tashi);
    expect(normalizeDictationText(cp(0xf56, 0xf40, 0xfb2, 0xf0c, 0xf64, 0xf72, 0xf66))).toBe(tashi);
    expect(normalizeDictationText(`${TSHEG}a${TSHEG}`)).toBe('a');
  });

  it('folds the Hebrew geresh, gershayim and maqaf and the Armenian hyphen to their keyboard stand-ins', () => {
    expect(normalizeDictationText(cp(0x5e6, 0x5f3, 0x5d9))).toBe(cp(0x5e6, 0x27, 0x5d9));
    expect(normalizeDictationText(cp(0x5e6, 0x5d4, 0x5f4, 0x5dc))).toBe(
      normalizeDictationText(cp(0x5e6, 0x5d4, 0x22, 0x5dc)),
    );
    expect(normalizeDictationText(cp(0x5d1, 0x5be, 0x5e1))).toBe(cp(0x5d1, 0x2d, 0x5e1));
    expect(normalizeDictationText(cp(0x57d, 0x58a, 0x57d))).toBe(cp(0x57d, 0x2d, 0x57d));
  });

  it('removes the Arabic tatweel and the N’Ko lajanyalan, which only stretch a word', () => {
    const marhaba = cp(0x645, 0x631, 0x62d, 0x628, 0x627);
    expect(normalizeDictationText(cp(0x645, 0x631, 0x62d, 0x640, 0x640, 0x628, 0x627))).toBe(
      marhaba,
    );
    expect(normalizeDictationText(`${cp(0x7d3)}${cp(0x7fa)}${cp(0x7cf)}`)).toBe(cp(0x7d3, 0x7cf));
    // Nothing but stretching is nothing to type.
    expect(validateActivity('dictation', dictation({ transcript: TATWEEL })).success).toBe(false);
  });

  it('cannot tell an elided article from a quotation mark: an apostrophe at a word edge is removed', () => {
    expect(alignDictation({ transcript: "Dit is 'n boek" }, 'Dit is n boek').similarity).toBe(1);
  });

  it('keeps a joiner only where it changes what is drawn', () => {
    const same = (a: string, b: string) => normalizeDictationText(a) === normalizeDictationText(b);
    // After a letter that joins nothing after it, a Persian or Sorani half-space changes nothing.
    expect(
      same(
        `${cp(0x631, 0x648, 0x632)}${ZWNJ}${cp(0x647, 0x627)}`,
        cp(0x631, 0x648, 0x632, 0x647, 0x627),
      ),
    ).toBe(true);
    expect(
      same(
        `${cp(0x62e, 0x627, 0x646, 0x6d5)}${ZWNJ}${cp(0x6a9, 0x627, 0x646)}`,
        cp(0x62e, 0x627, 0x646, 0x6d5, 0x6a9, 0x627, 0x646),
      ),
    ).toBe(true);
    // Between Latin letters it only breaks a ligature.
    expect(same(`Auf${ZWNJ}lage`, 'Auflage')).toBe(true);
    // After a letter that joins the next, it breaks the join: kept.
    expect(
      same(
        `${cp(0x645, 0x6cc)}${ZWNJ}${cp(0x62e, 0x648, 0x627, 0x647, 0x645)}`,
        cp(0x645, 0x6cc, 0x62e, 0x648, 0x627, 0x647, 0x645),
      ),
    ).toBe(false);
    // A joiner after a virama chooses a cluster's form: kept, as in the Sinhala Sri.
    expect(same(cp(0xdc1, 0xdca, 0x200d, 0xdbb, 0xdd3), cp(0xdc1, 0xdca, 0xdbb, 0xdd3))).toBe(
      false,
    );
    // A joiner anywhere else is removed: between two Arabic letters, between Han characters.
    expect(same(`${cp(0x647)}${ZWJ}${cp(0x62a)}`, cp(0x647, 0x62a))).toBe(true);
    expect(same(`${cp(0x6211)}${ZWJ}${cp(0x7231)}`, cp(0x6211, 0x7231))).toBe(true);
  });

  it('counts a kept joiner as part of its word, so a rule does not rewrite half a compound', () => {
    const tuesday = `${cp(0x633, 0x647)}${ZWNJ}${cp(0x634, 0x646, 0x628, 0x647)}`;
    expect(normalizeDictationText(tuesday, rules([cp(0x633, 0x647), cp(0x6f3)]))).toBe(tuesday);
    // A rewrite that leaves a joiner beside a digit leaves no joiner: typing the rule's `to` matches.
    expect(normalizeDictationText(`${cp(0x6f3)}${ZWNJ}${cp(0x634, 0x646, 0x628, 0x647)}`)).toBe(
      cp(0x6f3, 0x634, 0x646, 0x628, 0x647),
    );
  });

  it('folds sequences written two ways: legacy chillus, khanda ta, eyelash ra and a split SARA AM', () => {
    const same = (a: string, b: string) => normalizeDictationText(a) === normalizeDictationText(b);
    expect(same(cp(0xd2a, 0xd3e, 0xd32, 0xd4d, 0x200d), cp(0xd2a, 0xd3e, 0xd7d))).toBe(true);
    expect(same(cp(0x989, 0x9a4, 0x9cd, 0x200d, 0x9b8), cp(0x989, 0x9ce, 0x9b8))).toBe(true);
    expect(
      same(cp(0x935, 0x93e, 0x930, 0x94d, 0x200d, 0x92f), cp(0x935, 0x93e, 0x931, 0x94d, 0x92f)),
    ).toBe(true);
    expect(same(cp(0xe19, 0xe49, 0xe4d, 0xe32), cp(0xe19, 0xe49, 0xe33))).toBe(true);
    expect(same(cp(0xe99, 0xecd, 0xeb2), cp(0xe99, 0xeb3))).toBe(true);
  });

  it('compares a compatibility character as the character it stands for', () => {
    const same = (a: string, b: string) => normalizeDictationText(a) === normalizeDictationText(b);
    expect(same(cp(0xff12, 0xff10, 0xff12, 0xff14, 0x5e74), '2024年')).toBe(true);
    expect(same(`Listen: ${cp(0xff28, 0xff45, 0xff4c, 0xff4c, 0xff4f)}`, 'Listen: Hello')).toBe(
      true,
    );
    expect(same(cp(0x4e2d, 0x56fd, 0x2f08), cp(0x4e2d, 0x56fd, 0x4eba))).toBe(true);
    expect(same(cp(0xfeb3, 0xfefc, 0xfee1), cp(0x633, 0x644, 0x627, 0x645))).toBe(true);
    expect(same(`${cp(0xfb01)}ne`, 'fine')).toBe(true);
    expect(same(`25${cp(0x2103)}`, `25${cp(0xb0)}C`)).toBe(true);
    expect(same(`1${cp(0xba)}`, '1o')).toBe(true);
    // An isolated vowel-mark presentation form has no letter to put its mark on: it keeps its form.
    expect(normalizeDictationText(`a ${cp(0xfe70)}`)).toBe(`a ${cp(0xfe70)}`);
  });
});

describe('dictation normalisation reads one spelling as Unicode does', () => {
  const same = (a: string, b: string) => normalizeDictationText(a) === normalizeDictationText(b);

  it('keeps a joiner after every virama Unicode 16 lists, and before one after a letter', () => {
    // Myanmar asat, Meetei Mayek apun iyek, Tulu-Tigalari: viramas the first table missed.
    expect(same(cp(0x1000, 0x103a, 0x200c, 0x1000), cp(0x1000, 0x103a, 0x1000))).toBe(false);
    expect(same(cp(0xabe0, 0xabed, 0x200d, 0xabe0), cp(0xabe0, 0xabed, 0xabe0))).toBe(false);
    expect(same(cp(0x11380, 0x113ce, 0x200d, 0x11380), cp(0x11380, 0x113ce, 0x11380))).toBe(false);
    // The Bengali ya-phalaa after RA, and a Sinhala touching conjunct: a joiner before the virama.
    expect(
      same(cp(0x9b0, 0x200d, 0x9cd, 0x9af, 0x9be, 0x9ac), cp(0x9b0, 0x9cd, 0x9af, 0x9be, 0x9ac)),
    ).toBe(false);
    expect(
      same(cp(0xdb6, 0xdd4, 0xdaf, 0x200d, 0xdca, 0xda9), cp(0xdb6, 0xdd4, 0xdaf, 0xdca, 0xda9)),
    ).toBe(false);
    // Not before a virama with nothing written before it.
    expect(normalizeDictationText(`a ${ZWJ}${cp(0x94d)}`)).toBe(`a ${cp(0x94d)}`);
  });

  it('reads a repeated joiner as one', () => {
    const mi = cp(0x645, 0x6cc);
    const khaham = cp(0x62e, 0x648, 0x627, 0x647, 0x645);
    expect(normalizeDictationText(`${mi}${ZWNJ}${ZWNJ}${khaham}`)).toBe(`${mi}${ZWNJ}${khaham}`);
    const nom = cp(0x1828, 0x1823, 0x182e);
    expect(normalizeDictationText(`${nom}${MVS}${MVS}${cp(0x1820)}`)).toBe(
      `${nom}${MVS}${cp(0x1820)}`,
    );
  });

  it('reads joining letters from Unicode 16: Mandaic and Arabic Extended-C join, a small Farsi yeh does not', () => {
    expect(same(cp(0x841, 0x200c, 0x841), cp(0x841, 0x841))).toBe(false);
    expect(same(cp(0x628, 0x200c, 0x10ec2), cp(0x628, 0x10ec2))).toBe(false);
    expect(same(cp(0x628, 0x8c9, 0x200c, 0x628), cp(0x628, 0x8c9, 0x628))).toBe(true);
    // The Adlam nasalization mark is joined through, as a combining mark is.
    expect(same(cp(0x1e922, 0x1e94b, 0x200c, 0x1e922), cp(0x1e922, 0x1e94b, 0x1e922))).toBe(false);
  });

  it('keeps a vowel separator after a free variation selector, and a tag run however long, in linear time', () => {
    const ga = cp(0x182d);
    const a = cp(0x1820);
    expect(normalizeDictationText(`${ga}${a}${cp(0x1837)}${FVS1}${MVS}${a}`)).toBe(
      `${ga}${a}${cp(0x1837)}${FVS1}${MVS}${a}`,
    );
    const flag = `${BLACK_FLAG}${TAG_B.repeat(15_999)}`;
    const started = performance.now();
    expect(normalizeDictationText(flag)).toBe(flag);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('folds more sequences written two ways: nta, SARA AM with its tone mark between, eyelash ra with a joiner', () => {
    expect(same(cp(0xd0e, 0xd28, 0xd4d, 0xd31, 0xd46), cp(0xd0e, 0xd7b, 0xd4d, 0xd31, 0xd46))).toBe(
      true,
    );
    expect(same(cp(0xe19, 0xe4d, 0xe49, 0xe32), cp(0xe19, 0xe49, 0xe33))).toBe(true);
    expect(same(cp(0xe15, 0xe4d, 0xe48, 0xe32), cp(0xe15, 0xe48, 0xe33))).toBe(true);
    expect(same(cp(0xe99, 0xecd, 0xec9, 0xeb2), cp(0xe99, 0xec9, 0xeb3))).toBe(true);
    expect(
      same(
        cp(0x926, 0x941, 0x938, 0x931, 0x94d, 0x200d, 0x92f, 0x93e),
        cp(0x926, 0x941, 0x938, 0x931, 0x94d, 0x92f, 0x93e),
      ),
    ).toBe(true);
  });

  it('reads a presentation form of a mark as the mark on the character before it, and as itself on nothing', () => {
    expect(same('ｶﾞﾗｽ', 'ガラス')).toBe(true);
    expect(same('ﾊﾟﾝ', 'パン')).toBe(true);
    expect(same('ﾃﾞｨｸﾃｰｼｮﾝ', 'ディクテーション')).toBe(true);
    // Shadda with fatha, isolated and medial forms, on the letter before them.
    const muhammad = cp(0x645, 0x62d, 0x645, 0x64e, 0x651, 0x62f);
    expect(same(cp(0xfee3, 0xfea4, 0xfee4, 0xfc60, 0xfeaa), muhammad)).toBe(true);
    expect(same(cp(0xfee3, 0xfea4, 0xfee4, 0xfcf2, 0xfeaa), muhammad)).toBe(true);
    // At the start, or after a space, a form keeps itself rather than put a mark on nothing.
    expect(normalizeDictationText(cp(0xff9e))).toBe(cp(0xff9e));
    expect(normalizeDictationText(`a ${cp(0xfe77)}`)).toBe(`a ${cp(0xfe77)}`);
    // A dashed overline is punctuation, whatever its compatibility form.
    expect(normalizeDictationText(`a${cp(0xfe49)}b`)).toBe('ab');
  });

  it('reads a halfwidth jamo as the letter a Korean keyboard types, never composed into a syllable', () => {
    expect(normalizeDictationText(cp(0xffa1, 0xffc2))).toBe(cp(0x3131, 0x314f));
    expect(same(cp(0xffa1), cp(0x3131))).toBe(true);
    expect(same(cp(0xffa1, 0xffc2), cp(0xac00))).toBe(false);
  });

  it('reads Latin digraphs, circled numbers to 50 and the fullwidth tilde as what they stand for', () => {
    expect(same(cp(0x1c9, 0x75, 0x62, 0x61, 0x76), 'ljubav')).toBe(true);
    expect(same(`co${cp(0x140)}legi`, `col${MIDDLE_DOT}legi`)).toBe(true);
    expect(same(cp(0x133, 0x73), 'ijs')).toBe(true);
    expect(same(cp(0x3251), '21')).toBe(true);
    expect(same(cp(0x32bf), '50')).toBe(true);
    expect(same(`10時${cp(0xff5e)}12時`, `10時${cp(0x301c)}12時`)).toBe(true);
    // The Armenian ech-yiwn is a letter of its own, and stays one.
    expect(same(cp(0x587), cp(0x565, 0x582))).toBe(false);
  });

  it('keeps a drawn format character: the Arabic number sign over the digits after it', () => {
    expect(normalizeDictationText(cp(0x600, 0x661, 0x662))).toBe(cp(0x600, 0x661, 0x662));
    expect(same(cp(0x70f, 0x71d, 0x712), cp(0x71d, 0x712))).toBe(false);
  });

  it('reads a middle dot beside Chinese or Japanese as punctuation, and keeps it in the Catalan l·l', () => {
    expect(same(`约翰${MIDDLE_DOT}史密斯`, '约翰史密斯')).toBe(true);
    expect(same(`约翰${MIDDLE_DOT}史密斯`, `约翰${cp(0x30fb)}史密斯`)).toBe(true);
    expect(same(`ジョン${MIDDLE_DOT}スミス`, `ジョン${cp(0x30fb)}スミス`)).toBe(true);
    expect(normalizeDictationText(`col${MIDDLE_DOT}legi`)).toBe(`col${MIDDLE_DOT}legi`);
  });

  it('reads a lone surrogate as U+FFFD, so no removal can pair two into a character', () => {
    const replacement = cp(0xfffd);
    for (const typed of [
      `${cp(0xdb40)}!${cp(0xdc01)}`,
      `${cp(0xdb40)}${ZWNJ}${cp(0xde00)}`,
      `${cp(0xd801)}!${cp(0xdc00)}ab`,
    ]) {
      const once = normalizeDictationText(typed);
      expect(normalizeDictationText(once)).toBe(once);
      expect(once.startsWith(`${replacement}${replacement}`)).toBe(true);
    }
    // A rewrite ending in the high half of a pair and text starting with its low half make no letter.
    expect(normalizeDictationText(`&${cp(0xdc00)}&`, rules(['&', `x${cp(0xd835)}`]))).toBe(
      `x${replacement}${replacement}x${replacement}`,
    );
  });
});

describe('dictation rules in every script', () => {
  it('fire inside running text when their edge is a letter of a script written without spaces', () => {
    expect(normalizeDictationText('我有两本书', rules(['两', '2']))).toBe('我有2本书');
    expect(normalizeDictationText('コーヒー二杯', rules(['二', '2']))).toBe('コーヒー2杯');
  });

  it('never end a match before a combining mark, a kept joiner or a tag character', () => {
    expect(normalizeDictationText(cp(0xe21, 0xe35), rules([cp(0xe21), 'x']))).toBe(
      cp(0xe21, 0xe35),
    );
    expect(normalizeDictationText(`#${VS16}${KEYCAP}`, rules(['#', 'number']))).toBe(`#${KEYCAP}`);
  });

  it('treat a letter of another script beside a spaced word as a visible edge', () => {
    expect(normalizeDictationText(`ok${cp(0x4e2d)}`, rules(['ok', 'x']))).toBe(`x${cp(0x4e2d)}`);
  });

  it('set a rewrite apart on both sides inside Japanese, or on neither', () => {
    expect(normalizeDictationText('コーヒー&ケーキ', rules(['&', 'and']))).toBe(
      'コーヒーandケーキ',
    );
  });

  it('read a number as a word in every script: a Thai digit is a boundary, and a rewrite is set apart from one', () => {
    const hundred = cp(0xe51, 0xe50, 0xe50);
    expect(normalizeDictationText(hundred, rules([cp(0xe50), 'x']))).toBe(hundred);
    expect(normalizeDictationText(`${cp(0xe55, 0xe50)}%`, rules(['%', 'percent']))).toBe(
      `${cp(0xe55, 0xe50)} percent`,
    );
  });

  it('set a rewrite apart after it only from what follows it in the output', () => {
    expect(normalizeDictationText('USD.USD.', rules(['USD.', '$us']))).toBe('$us$us');
    expect(normalizeDictationText('USD.USD.', rules(['USD.', 'us$']))).toBe('us$us$');
    expect(normalizeDictationText('&&', rules(['&', 'and']))).toBe('and and');
    expect(normalizeDictationText('a&b', rules(['&', 'and']))).toBe('a and b');
  });
});

describe('dictation rules set a symbol’s rewrite apart as words', () => {
  it.each<[string, readonly [string, string], string, string]>([
    ['a percent sign after a digit', ['%', 'percent'], 'it is 50%', 'it is 50 percent'],
    ['a dollar sign after a digit', ['$', 'dollars'], 'it costs 5$', 'it costs 5 dollars'],
    ['a degree sign', ['°', 'degrees'], 'it is 20°', 'it is 20 degrees'],
    ['a plus sign between digits', ['+', 'plus'], '2+2', '2 plus 2'],
    ['a number sign before a digit', ['#', 'number'], '#1', 'number 1'],
    ['two ampersands in a row', ['&', 'and'], 'a&&b', 'a and and b'],
    ['a suffix rule', ["'s", 'is'], "he's here", 'he is here'],
    ['a rewrite to a symbol', ['&', '+'], 'a&b', 'a+b'],
    [
      'a rewrite into Katakana',
      [cp(0xff05), cp(0x30d1, 0x30fc)],
      `50${cp(0xff05)}`,
      `50${cp(0x30d1, 0x30fc)}`,
    ],
    [
      'a rewrite between Han characters',
      ['&', cp(0x548c)],
      `${cp(0x4e2d)}&${cp(0x6587)}`,
      cp(0x4e2d, 0x548c, 0x6587),
    ],
    ['a punctuation mark before a space', ['&', 'and'], 'rock & roll', 'rock and roll'],
  ])('%s', (_label, rule, typed, expected) => {
    expect(normalizeDictationText(typed, rules(rule))).toBe(expected);
  });
});

/**
 * The matcher the rules used before this implementation: a regular expression
 * with a word boundary at each edge of `from` that is a word character. Kept
 * here as the model the literal search is checked against.
 */
function modelNormalize(text: string, pairs: readonly (readonly [string, string])[]): string {
  const joiners = cp(0x200c, 0x200d, 0x180e);
  const unspacedClass =
    '\\p{Script_Extensions=Han}\\p{Script_Extensions=Hiragana}\\p{Script_Extensions=Katakana}\\p{Script_Extensions=Thai}\\p{Script_Extensions=Lao}\\p{Script_Extensions=Khmer}\\p{Script_Extensions=Myanmar}';
  const WORD = new RegExp(`^[\\p{L}\\p{M}\\p{N}${joiners}]$`, 'u');
  const UNSPACED = new RegExp(`^(?!\\p{Nd})[${unspacedClass}]$`, 'u');
  const spacedWord = `(?!(?!\\p{Nd})[${unspacedClass}])[\\p{L}\\p{M}\\p{N}${joiners}]`;
  const extending = `[\\p{M}${joiners}${cp(0xe0020)}-${cp(0xe007f)}]`;
  const spaced = (point: string | undefined) =>
    point !== undefined && WORD.test(point) && !UNSPACED.test(point);
  let working = preStripNormalize(text);
  for (const [rawFrom, rawTo] of pairs) {
    const from = preStripNormalize(rawFrom);
    const to = normalizeDictationText(rawTo);
    if (from === '' || to === '') {
      continue;
    }
    const points = Array.from(from);
    const pattern = new RegExp(
      `${spaced(points[0]) ? `(?<!${spacedWord})` : ''}${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${spaced(points.at(-1)) ? `(?!${spacedWord})` : ''}(?!${extending})`,
      'gu',
    );
    const toPoints = Array.from(to);
    let output = '';
    let consumed = 0;
    const apartAfter = (following: string) =>
      consumed > 0 && spaced(toPoints.at(-1)) && spaced(Array.from(following)[0]) ? ' ' : '';
    for (const match of working.matchAll(pattern)) {
      const index = match.index as number;
      const between = working.slice(consumed, index);
      output += between === '' ? '' : apartAfter(between);
      output += between;
      if (spaced(toPoints[0]) && spaced(Array.from(output).at(-1))) {
        output += ' ';
      }
      output += to;
      consumed = index + match[0].length;
    }
    const rest = working.slice(consumed);
    working = output + apartAfter(rest) + rest;
  }
  return normalizeDictationText(working);
}

describe('dictation rule matching', () => {
  const alphabet = fc.constantFrom(
    'a',
    'b',
    'é',
    'e',
    cp(0x301),
    '1',
    ' ',
    '-',
    "'",
    '&',
    '%',
    '.',
    '$',
    cp(0x1f600),
    cp(0xd83d),
    cp(0xde00),
    cp(0x4e2d),
    cp(0x30d1),
    cp(0x928),
    cp(0x94b),
    cp(0xe01),
    cp(0xe51),
    'US',
  );
  const fragment = (max: number) =>
    fc.array(alphabet, { minLength: 1, maxLength: max }).map((parts) => parts.join(''));

  it('rewrites exactly where a regular expression with the same word boundaries matches', () => {
    fc.assert(
      fc.property(
        fragment(24),
        fc.array(fc.tuple(fragment(3), fragment(4)), { minLength: 1, maxLength: 3 }),
        (text, pairs) => {
          expect(normalizeDictationText(text, rules(...pairs))).toBe(modelNormalize(text, pairs));
        },
      ),
      { numRuns: 3000 },
    );
    // Three thousand texts through two normalisers: seconds, not the default five.
  }, 30_000);

  it('normalises idempotently over joiners, selectors, tags, keycaps and in-word punctuation', () => {
    const tricky = fc.constantFrom(
      'a',
      ' ',
      '1',
      '#',
      '*',
      '-',
      "'",
      cp(0x301),
      ZWNJ,
      ZWJ,
      MVS,
      FVS1,
      FVS2,
      TAG_B,
      cp(0xe007f),
      BLACK_FLAG,
      KEYCAP,
      VS16,
      MIDDLE_DOT,
      TSHEG,
      cp(0xf0c),
      TATWEEL,
      cp(0x5f3),
      cp(0x5be),
      cp(0x182d),
      cp(0x645),
      cp(0x632),
      cp(0x130),
      cp(0x200b),
      cp(0x2bc),
      '=',
      '<',
      '.',
      cp(0x338),
      cp(0xdca),
      cp(0xdbb),
      cp(0xd28),
      cp(0xd4d),
      cp(0xe4d),
      cp(0xe32),
      cp(0xff21),
      cp(0xfe70),
      cp(0xfb01),
      cp(0xff76),
      cp(0xff9e),
      cp(0xfc60),
      cp(0xfe77),
      cp(0xffa1),
      cp(0xffc2),
      cp(0xfe49),
      cp(0x600),
      cp(0x30fb),
      cp(0x4e2d),
      cp(0xe48),
      cp(0xd31),
      cp(0x931),
      cp(0x94d),
      cp(0x9b0),
      cp(0x841),
      cp(0x8c9),
      cp(0x1e94b),
      cp(0x103a),
      cp(0xff5e),
      cp(0x301c),
      cp(0x140),
      cp(0xdb40),
      cp(0xdc01),
      '!',
    );
    fc.assert(
      fc.property(
        fc.array(tricky, { maxLength: 30 }).map((parts) => parts.join('')),
        (text) => {
          const once = normalizeDictationText(text);
          expect(normalizeDictationText(once)).toBe(once);
          const pre = preStripNormalize(text);
          expect(preStripNormalize(pre)).toBe(pre);
        },
      ),
      { numRuns: 5000 },
    );
  }, 30_000);
});
