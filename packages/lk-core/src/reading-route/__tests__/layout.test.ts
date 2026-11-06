import { describe, expect, it } from 'vitest';
import { countParagraphs, overlaps, passageLayout, sentencesTouching } from '../layout.js';
import { containsPhrase, findQuote, quoteText } from '../quotes.js';
import { PASSAGE } from './fixture.js';

const sentences = (body: string): string[] =>
  passageLayout(body).sentences.map((sentence) => body.slice(sentence.start, sentence.end));

describe('passageLayout', () => {
  it('cuts the passage into paragraphs at blank lines and labels them', () => {
    const layout = passageLayout(PASSAGE, { paragraphLabels: ['A', 'B', 'C', 'D', 'E'] });
    expect(layout.paragraphs.map((paragraph) => paragraph.label)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
    expect(layout.sentences).toHaveLength(14);
    expect(PASSAGE.slice(layout.sentences[2]?.start, layout.sentences[2]?.end)).toBe(
      'By 1960, only a handful of British cities still ran trams at all.',
    );
    expect(layout.sentences.at(-1)?.paragraph).toBe(4);
    expect(countParagraphs(PASSAGE)).toBe(5);
  });

  it('leaves labels and sections off when they do not fit the passage', () => {
    const layout = passageLayout(PASSAGE, {
      paragraphLabels: ['A'],
      sections: [{ label: 'Text 1', paragraphs: 2 }],
    });
    expect(layout.paragraphs.every((paragraph) => paragraph.label === undefined)).toBe(true);
    expect(layout.sections).toEqual([]);
  });

  it('places sections over runs of paragraphs, and an empty label leaves one unlabelled', () => {
    const layout = passageLayout('One.\n\nTwo.\n\nThree.', {
      paragraphLabels: ['', 'B', 'C'],
      sections: [
        { label: 'A', title: 'First reviewer', paragraphs: 1 },
        { label: 'B', paragraphs: 2 },
      ],
    });
    expect(layout.sections).toEqual([
      { label: 'A', title: 'First reviewer', first: 0, last: 0 },
      { label: 'B', first: 1, last: 2 },
    ]);
    expect(layout.paragraphs.map((paragraph) => [paragraph.label, paragraph.section])).toEqual([
      [undefined, 0],
      ['B', 1],
      ['C', 1],
    ]);
  });

  it('does not end a sentence at an abbreviation, an initial, a decimal or a lower-case word', () => {
    expect(
      sentences(
        'Dr. Smith met J. K. Rowling in the U.S. Army museum. It cost 3.5 million, e.g. a lot. Wait... and see! "Really?" she asked. Then it rained.',
      ),
    ).toEqual([
      'Dr. Smith met J. K. Rowling in the U.S. Army museum.',
      'It cost 3.5 million, e.g. a lot.',
      'Wait... and see!',
      '"Really?" she asked.',
      'Then it rained.',
    ]);
  });

  it('ends a sentence at a closing quotation mark, a line break, and the end', () => {
    expect(sentences('He said "stop." Then he left\nA new line. No end')).toEqual([
      'He said "stop."',
      'Then he left',
      'A new line.',
      'No end',
    ]);
    expect(sentences('In 1990. 2000 was next.')).toEqual(['In 1990.', '2000 was next.']);
    expect(sentences('Etc. The end.')).toEqual(['Etc.', 'The end.']);
  });

  it('ends sentences of scripts written without spaces at their own full stops', () => {
    expect(sentences('今日は晴れです。明日は雨です！本当？」')).toEqual([
      '今日は晴れです。',
      '明日は雨です！',
      '本当？」',
    ]);
  });

  it('gives nothing for an empty or blank passage', () => {
    expect(passageLayout('').paragraphs).toEqual([]);
    expect(passageLayout('  \n\n \n').sentences).toEqual([]);
  });

  it('finds which sentences a range touches', () => {
    const layout = passageLayout(PASSAGE);
    const start = PASSAGE.indexOf('rerouted');
    expect(sentencesTouching(layout, { start, end: PASSAGE.indexOf('handful') })).toEqual([1, 2]);
    expect(overlaps({ start: 0, end: 2 }, { start: 2, end: 4 })).toBe(false);
  });
});

describe('findQuote', () => {
  it('finds a quote once, by text or with its occurrence', () => {
    expect(findQuote('a cat and a dog', 'a dog')).toEqual({
      found: true,
      range: { start: 10, end: 15 },
    });
    expect(findQuote('a cat and a cat', { text: 'cat', occurrence: 2 })).toEqual({
      found: true,
      range: { start: 12, end: 15 },
    });
  });

  it('says why it cannot', () => {
    expect(findQuote('abc', '')).toEqual({ found: false, reason: 'empty', count: 0 });
    expect(findQuote('abc', 7)).toEqual({ found: false, reason: 'empty', count: 0 });
    expect(findQuote('abc', 'x')).toEqual({ found: false, reason: 'missing', count: 0 });
    expect(findQuote('a a a', 'a a')).toEqual({ found: false, reason: 'ambiguous', count: 2 });
    expect(findQuote('a b', { text: 'a', occurrence: 2 })).toEqual({
      found: false,
      reason: 'occurrence',
      count: 1,
    });
  });

  it('forgives whitespace and curly quotation marks, and maps back to the passage', () => {
    const body = 'He said  “no”\nto the ‘plan’.';
    const match = findQuote(body, 'said "no" to the \'plan\'');
    expect(match.found && body.slice(match.range.start, match.range.end)).toBe(
      'said  “no”\nto the ‘plan’',
    );
    expect(findQuote(body, '  said ').found).toBe(true);
  });

  it('reads either form of a quote, and finds phrases regardless of case', () => {
    expect(quoteText({ text: 'x' })).toBe('x');
    expect(quoteText(null)).toBe('');
    expect(containsPhrase('The Big  Picture', 'big picture')).toBe(true);
    expect(containsPhrase('abc', ' ')).toBe(false);
  });
});
