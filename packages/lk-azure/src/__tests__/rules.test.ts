import type { SpeechAssessment } from '@intellectif/lk-core/scoring';
import { describe, expect, it } from 'vitest';
import { type AzureAssessmentResult, assessmentFromAzure } from '../index.js';
import { capture, requestOf, resultsOf } from './support.js';

/** The assessment of an accepted result; a refusal fails the test with its reason. */
function assessed(result: AzureAssessmentResult): SpeechAssessment {
  if (!result.ok) {
    throw new Error(`refused ${result.code}: ${result.message} ${JSON.stringify(result.errors)}`);
  }
  return result.assessment;
}

/** Maps a capture, optionally with its results changed first. */
function run(name: string, change?: (results: ReturnType<typeof resultsOf>) => void) {
  const results = resultsOf(name);
  change?.(results);
  return assessmentFromAzure(results, requestOf(capture(name)));
}

describe('nothing heard', () => {
  it.each(['prod-silence', 'prod-noise', 'rest-silence'])(
    '%s, a success with every word omitted, is no_speech with no score',
    (name) => {
      const raw = capture(name).results[0];
      expect(raw.RecognitionStatus).toBe('Success');
      expect(raw.DisplayText).toBe('.');
      const assessment = assessed(run(name));
      expect(assessment).toMatchObject({ status: 'no_speech', scores: {}, words: [] });
      expect(assessment).not.toHaveProperty('recognizedText');
    },
  );

  it.each(['InitialSilenceTimeout', 'BabbleTimeout'])(
    'reads a %s result as nothing heard',
    (status) => {
      const result = assessmentFromAzure(
        [{ RecognitionStatus: status }],
        requestOf(capture('prod-en-us-clean')),
      );
      expect(assessed(result).status).toBe('no_speech');
    },
  );

  it('is no_speech for a continuous take that recognised nothing', () => {
    const request = { ...requestOf(capture('prod-en-us-clean')), miscue: false };
    expect(assessed(assessmentFromAzure([], request)).status).toBe('no_speech');
  });

  it('adds nothing for a silent result among heard ones', () => {
    const request = { ...requestOf(capture('prod-en-us-continuous-segments')) };
    const results = resultsOf('prod-en-us-continuous-segments');
    const plain = assessed(assessmentFromAzure(results, request));
    const withSilence = assessed(
      assessmentFromAzure([...results, { RecognitionStatus: 'InitialSilenceTimeout' }], request),
    );
    expect(withSilence).toEqual(plain);
  });
});

describe('refusals', () => {
  it('refuses FivePoint, whose scores read as low hundred-mark ones', () => {
    expect(run('rest-en-us-fivepoint')).toMatchObject({ ok: false, code: 'five_point_scale' });
  });

  it('refuses miscue across several results', () => {
    const results = resultsOf('prod-en-us-continuous-segments');
    const request = { ...requestOf(capture('prod-en-us-continuous-segments')), miscue: true };
    expect(assessmentFromAzure(results, request)).toMatchObject({
      ok: false,
      code: 'miscue_across_results',
    });
  });

  it.each([
    ['not JSON', '{"RecognitionStatus":'],
    ['not an object', '[1, 2]'],
    ['a plain transcription', { RecognitionStatus: 'Success', NBest: [{ Lexical: 'hello' }] }],
    ['no NBest', { RecognitionStatus: 'Success' }],
  ])('refuses %s as not_a_result', (_label, result) => {
    expect(assessmentFromAzure([result], requestOf(capture('prod-en-us-clean')))).toMatchObject({
      ok: false,
      code: 'not_a_result',
    });
  });

  it('refuses NoMatch as speech that matched nothing, not a failure to retry', () => {
    const result = assessmentFromAzure(
      [{ RecognitionStatus: 'NoMatch' }],
      requestOf(capture('prod-en-us-clean')),
    );
    expect(result).toMatchObject({ ok: false, code: 'no_match' });
  });

  it.each([['Error'], [4], [undefined]])('refuses status %s as recognition_failed', (status) => {
    const results = resultsOf('prod-en-us-clean');
    results[0].RecognitionStatus = status;
    expect(assessmentFromAzure(results, requestOf(capture('prod-en-us-clean')))).toMatchObject({
      ok: false,
      code: 'recognition_failed',
    });
  });

  it('names the result a refusal is about', () => {
    const results = [...resultsOf('prod-en-us-continuous-segments'), 'not json'];
    const request = requestOf(capture('prod-en-us-continuous-segments'));
    const refusal = assessmentFromAzure(results, request);
    expect(refusal).toMatchObject({ ok: false, message: expect.stringMatching(/^Result 4 of 4:/) });
  });

  it("refuses what lk-core refuses, with lk-core's reasons", () => {
    const refusal = run('prod-en-us-clean', (results) => {
      results[0].NBest[0].Words[2].Word = '';
      results[0].NBest[0].Words[3].PronunciationAssessment.AccuracyScore = 150;
    });
    expect(refusal).toMatchObject({ ok: false, code: 'invalid_assessment' });
    const paths = (refusal as { errors: { path: string[] }[] }).errors.map((e) => e.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['words.2.text', 'words.3.accuracy']));
  });

  it('refuses words lk-core refuses across several results too', () => {
    const results = resultsOf('prod-en-us-continuous-segments');
    results[1].NBest[0].Words[0].Word = '';
    const request = requestOf(capture('prod-en-us-continuous-segments'));
    expect(assessmentFromAzure(results, request)).toMatchObject({
      ok: false,
      code: 'invalid_assessment',
    });
  });
});

describe('statuses and shapes', () => {
  it('accepts the numeric success status of the documentation', () => {
    const named = assessed(run('prod-en-us-clean'));
    const numeric = assessed(
      run('prod-en-us-clean', (results) => {
        results[0].RecognitionStatus = 0;
      }),
    );
    expect(numeric).toEqual(named);
  });

  it('reads a result as text exactly as parsed', () => {
    const results = resultsOf('prod-en-us-clean');
    const request = requestOf(capture('prod-en-us-clean'));
    expect(assessmentFromAzure([JSON.stringify(results[0])], request)).toEqual(
      assessmentFromAzure(results, request),
    );
  });

  it('reads REST, whose scores sit directly on each node', () => {
    const assessment = assessed(run('rest-en-us-clean-rich'));
    expect(assessment.scores).toMatchObject({ accuracy: 95, fluency: 100, completeness: 100 });
    const word = assessment.words[1];
    expect(word).toMatchObject({ text: 'weather', error: 'none', accuracy: expect.any(Number) });
    expect(word?.phonemes?.[0]).toMatchObject({ symbol: 'w', heardAs: expect.any(Array) });
    expect(assessment.prosody?.monotoneConfidence).toBeGreaterThan(0);
  });

  it('keeps the binding, the assessor and the scale it was asked for', () => {
    const assessment = assessed(run('prod-en-us-clean'));
    expect(assessment).toMatchObject({
      assessmentVersion: '1.0',
      task: 'scripted',
      locale: 'en-US',
      referenceText: capture('prod-en-us-clean').request.referenceText,
      recordingKey: 'take-1.wav',
      assessor: { kind: 'auto', id: 'azure-pronunciation-assessment' },
      scale: 100,
      miscue: 'assessor',
    });
    const named = assessmentFromAzure(resultsOf('prod-en-us-clean'), {
      ...requestOf(capture('prod-en-us-clean')),
      assessorId: 'azure/eastus/en-US',
    });
    expect(assessed(named).assessor).toEqual({ kind: 'auto', id: 'azure/eastus/en-US' });
  });

  it('carries the signal-to-noise ratio of one result, when it has one', () => {
    expect(assessed(run('prod-en-us-clean')).signal?.snrDb).toBeGreaterThan(30);
    const without = assessed(
      run('prod-en-us-clean', (results) => {
        delete results[0].SNR;
      }),
    );
    expect(without).not.toHaveProperty('signal');
  });
});

describe('words', () => {
  it('leaves an omitted word without a score or a time (SDK)', () => {
    const omitted = assessed(run('prod-en-us-omission')).words.find((w) => w.error === 'omission');
    expect(omitted).toEqual({ text: 'lovely', error: 'omission', vendorError: 'Omission' });
  });

  it('leaves an omitted word without the 0, 0 and 0 REST gives it', () => {
    const raw = capture('rest-en-us-omission').results[0].NBest[0].Words.find(
      (w: { ErrorType: string }) => w.ErrorType === 'Omission',
    );
    expect(raw).toMatchObject({ Offset: 0, Duration: 0, AccuracyScore: 0 });
    const omitted = assessed(run('rest-en-us-omission')).words.find((w) => w.error === 'omission');
    expect(omitted).toEqual({ text: 'lovely', error: 'omission', vendorError: 'Omission' });
  });

  it('maps insertions and mispronunciations, keeping the label verbatim', () => {
    const words = assessed(run('prod-en-us-insertion')).words;
    expect(words.filter((w) => w.error === 'insertion')).toEqual([
      expect.objectContaining({ vendorError: 'Insertion', accuracy: expect.any(Number) }),
    ]);
    const mispronounced = assessed(run('prod-en-us-mispronounced')).words.filter(
      (w) => w.error === 'mispronunciation',
    );
    expect(mispronounced).toHaveLength(1);
    expect(mispronounced[0]?.accuracy).toBeLessThan(60);
  });

  it('keeps a prosody error type as the label of a word read correctly', () => {
    const assessment = assessed(
      run('prod-en-us-clean', (results) => {
        results[0].NBest[0].Words[4].PronunciationAssessment.ErrorType = 'UnexpectedBreak';
        results[0].NBest[0].Words[5].PronunciationAssessment.ErrorType = 'SomethingNew';
        delete results[0].NBest[0].Words[6].PronunciationAssessment.ErrorType;
      }),
    );
    expect(assessment.words[4]).toMatchObject({ error: 'none', vendorError: 'UnexpectedBreak' });
    expect(assessment.words[5]).toMatchObject({ error: 'none', vendorError: 'SomethingNew' });
    expect(assessment.words[6]?.error).toBe('none');
    expect(assessment.words[6]).not.toHaveProperty('vendorError');
  });

  it('converts ticks to milliseconds from the start of the recording', () => {
    const raw = capture('prod-en-us-clean').results[0].NBest[0].Words[1];
    const word = assessed(run('prod-en-us-clean')).words[1];
    expect(word?.startMs).toBe(raw.Offset / 10_000);
    expect(word?.durationMs).toBe(raw.Duration / 10_000);
    expect(word?.phonemes?.[0]?.startMs).toBe(raw.Phonemes[0].Offset / 10_000);
  });

  it('leaves out a word time Azure did not give', () => {
    const word = assessed(
      run('prod-en-us-clean', (results) => {
        results[0].NBest[0].Words[1].Offset = null;
        results[0].NBest[0].Words[1].PronunciationAssessment.AccuracyScore = 'high';
      }),
    ).words[1];
    expect(word).not.toHaveProperty('startMs');
    expect(word).not.toHaveProperty('accuracy');
    expect(word?.phonemes?.[0]).not.toHaveProperty('startMs');
  });

  it('leaves out the time of a sound that falls outside its word', () => {
    const word = assessed(
      run('prod-en-us-clean', (results) => {
        const raw = results[0].NBest[0].Words[1];
        raw.Phonemes[0].Offset = raw.Offset - 20_000_000;
        raw.Syllables[0].Offset = raw.Offset + raw.Duration;
        delete raw.Phonemes[1].Duration;
      }),
    ).words[1];
    expect(word?.phonemes?.[0]).not.toHaveProperty('startMs');
    expect(word?.phonemes?.[0]).toHaveProperty('accuracy');
    expect(word?.syllables?.[0]).not.toHaveProperty('startMs');
    expect(word?.phonemes?.[1]).toMatchObject({ durationMs: 0 });
  });
});

describe('sounds and their names', () => {
  it('keeps only named syllables: es-ES names them all ""', () => {
    const raw = capture('prod-es-es-clean').results[0].NBest[0].Words;
    expect(raw.some((w: { Syllables?: unknown[] }) => (w.Syllables ?? []).length > 0)).toBe(true);
    const words = assessed(run('prod-es-es-clean')).words;
    expect(words.some((w) => w.syllables !== undefined)).toBe(false);
    expect(assessed(run('prod-en-us-clean')).words[1]?.syllables?.[0]).toMatchObject({
      text: expect.any(String),
      grapheme: expect.any(String),
    });
  });

  it('keeps the score of a phoneme Azure names "", and no symbol or alphabet', () => {
    const assessment = assessed(run('prod-es-es-clean'));
    const phoneme = assessment.words[0]?.phonemes?.[0];
    expect(phoneme).toHaveProperty('accuracy');
    expect(phoneme).not.toHaveProperty('symbol');
    expect(assessment).not.toHaveProperty('phonemeAlphabet');
  });

  it('drops candidates Azure names "", as es-ES REST returns them', () => {
    const raw = JSON.stringify(capture('rest-es-es-clean').results);
    expect(raw).toContain('"NBestPhonemes"');
    const words = assessed(run('rest-es-es-clean')).words;
    expect(words.some((w) => w.phonemes?.some((p) => p.heardAs !== undefined))).toBe(false);
  });

  it('leaves out what a sound does not carry', () => {
    const word = assessed(
      run('prod-en-us-clean', (results) => {
        const raw = results[0].NBest[0].Words[1];
        delete raw.Syllables[0].Grapheme;
        delete raw.Syllables[0].PronunciationAssessment.AccuracyScore;
        delete raw.Phonemes[0].PronunciationAssessment.AccuracyScore;
      }),
    ).words[1];
    expect(word?.syllables?.[0]).not.toHaveProperty('grapheme');
    expect(word?.syllables?.[0]).not.toHaveProperty('accuracy');
    expect(word?.phonemes?.[0]).not.toHaveProperty('accuracy');
    expect(word?.phonemes?.[0]).toHaveProperty('symbol');
  });

  it('declares the alphabet asked for, and SAPI by default', () => {
    expect(assessed(run('prod-en-us-clean')).phonemeAlphabet).toBe('ipa');
    expect(assessed(run('rest-zh-cn-clean')).phonemeAlphabet).toBe('sapi');
    const results = resultsOf('rest-zh-cn-clean');
    const { phonemeAlphabet: _sent, ...unsaid } = requestOf(capture('rest-zh-cn-clean'));
    expect(assessed(assessmentFromAzure(results, unsaid)).phonemeAlphabet).toBe('sapi');
  });
});

describe('text and prosody', () => {
  it('prefers the lexical form, where numbers stay words', () => {
    const assessment = assessed(
      run('prod-en-us-clean', (results) => {
        results[0].NBest[0].Lexical = 'the weather is lovely today';
        results[0].DisplayText = 'The weather is lovely today.';
      }),
    );
    expect(assessment.recognizedText).toBe('the weather is lovely today');
    const display = assessed(
      run('prod-en-us-clean', (results) => {
        delete results[0].NBest[0].Lexical;
      }),
    );
    expect(display.recognizedText).toBe(capture('prod-en-us-clean').results[0].DisplayText);
  });

  it('gives no recognised text when Azure recognised none', () => {
    const single = assessed(
      run('prod-en-us-clean', (results) => {
        results[0].NBest[0].Lexical = '.';
        results[0].DisplayText = '  ';
      }),
    );
    expect(single).not.toHaveProperty('recognizedText');
    const results = capture('prod-en-us-continuous-segments').results;
    const expected = [results[0], results[2]].map((r) => r.NBest[0].Lexical.trim()).join(' ');
    const missing = assessed(
      run('prod-en-us-continuous-segments', (changed) => {
        delete changed[1].NBest[0].Lexical;
        delete changed[1].DisplayText;
      }),
    );
    expect(missing.recognizedText).toBe(expected);
    const blank = assessed(
      run('prod-en-us-continuous-segments', (changed) => {
        changed[1].NBest[0].Lexical = '.';
        changed[1].DisplayText = '  ';
      }),
    );
    expect(blank.recognizedText).toBe(expected);
  });

  it('carries the monotone confidence once, only when it is one', () => {
    expect(assessed(run('prod-en-us-clean')).prosody).toEqual({
      monotoneConfidence: expect.any(Number),
    });
    const later = assessed(
      run('prod-en-us-clean', (results) => {
        const words = results[0].NBest[0].Words;
        delete words[0].PronunciationAssessment.Feedback;
        words[1].PronunciationAssessment.Feedback.Prosody.Intonation.Monotone.SyllablePitchDeltaConfidence = 0.25;
      }),
    );
    expect(later.prosody).toEqual({ monotoneConfidence: 0.25 });
    const outOfRange = assessed(
      run('prod-en-us-clean', (results) => {
        for (const word of results[0].NBest[0].Words) {
          word.PronunciationAssessment.Feedback.Prosody.Intonation.Monotone.SyllablePitchDeltaConfidence = 1.5;
        }
      }),
    );
    expect(outOfRange).not.toHaveProperty('prosody');
    const negative = assessed(
      run('prod-en-us-clean', (results) => {
        for (const word of results[0].NBest[0].Words) {
          word.PronunciationAssessment.Feedback.Prosody.Intonation.Monotone.SyllablePitchDeltaConfidence =
            -0.1;
        }
      }),
    );
    expect(negative).not.toHaveProperty('prosody');
  });

  it('gives no prosody score outside en-US, as Azure gives none', () => {
    expect(assessed(run('prod-es-es-prosody-requested')).scores).not.toHaveProperty('prosody');
  });
});

describe('several results: one continuous take', () => {
  const name = 'prod-en-us-continuous-segments';

  it('holds every result’s words in order, judged by the aligner', () => {
    const results = capture(name).results;
    const assessment = assessed(run(name));
    const words = results.flatMap((r) => r.NBest[0].Words.map((w: { Word: string }) => w.Word));
    expect(assessment.words.map((w) => w.text)).toEqual(words);
    expect(assessment.miscue).toBe('none');
    expect(assessment).not.toHaveProperty('signal');
    expect(assessment.recognizedText).toBe(results.map((r) => r.NBest[0].Lexical.trim()).join(' '));
  });

  it('charges its pauses, as single-shot does, where the pieces each score them free', () => {
    const pieces = capture(name).results.map((r) => r.NBest[0].PronunciationAssessment);
    expect(pieces.map((p) => p.FluencyScore)).toEqual([100, 99, 100]);
    const { scores } = assessed(run(name));
    expect(scores.fluency).toBeLessThan(70);
    expect(scores.completeness).toBe(100);
    const mean = pieces.reduce((s, p) => s + p.ProsodyScore, 0) / pieces.length;
    expect(scores.prosody).toBe(Math.round(mean * 10) / 10);
    expect(scores.overall).toBeGreaterThan(0);
  });

  it('counts a word left out, and a word said instead, as 0 accuracy and incomplete', () => {
    const full = assessed(run(name)).scores;
    const omitted = assessed(
      run(name, (results) => {
        results[1].NBest[0].Words.splice(0, 1);
      }),
    ).scores;
    expect(omitted.completeness).toBeLessThan(full.completeness as number);
    expect(omitted.accuracy).toBeLessThan(full.accuracy as number);
    const substituted = assessed(
      run(name, (results) => {
        results[1].NBest[0].Words[0].Word = 'zebra';
      }),
    ).scores;
    expect(substituted.completeness).toBe(omitted.completeness);
    expect(substituted.accuracy).toBe(omitted.accuracy);
  });

  it('counts a mispronounced word, and charges it fluency, as Azure does', () => {
    const full = assessed(run(name)).scores;
    const mispronounced = assessed(
      run(name, (results) => {
        const word = results[0].NBest[0].Words[1].PronunciationAssessment;
        word.ErrorType = 'Mispronunciation';
        word.AccuracyScore = 40;
      }),
    ).scores;
    expect(mispronounced.completeness).toBeLessThan(full.completeness as number);
    expect(mispronounced.accuracy).toBeLessThan(full.accuracy as number);
    expect(mispronounced.fluency).toBeLessThan(full.fluency as number);
  });

  it('caps fluency at 100, which the padding can pass when words touch', () => {
    const { scores } = assessed(
      run(name, (results) => {
        // Every word starts where the last one ended: no time outside words.
        let at = results[0].NBest[0].Words[0].Offset;
        for (const result of results) {
          for (const word of result.NBest[0].Words) {
            const shift = at - word.Offset;
            word.Offset = at;
            for (const sound of [...(word.Syllables ?? []), ...(word.Phonemes ?? [])]) {
              sound.Offset += shift;
            }
            at += word.Duration;
          }
        }
      }),
    );
    expect(scores.fluency).toBe(100);
  });

  it('leaves accuracy and the overall score out when a word read has no score', () => {
    const { scores } = assessed(
      run(name, (results) => {
        delete results[2].NBest[0].Words[0].PronunciationAssessment.AccuracyScore;
      }),
    );
    expect(scores).not.toHaveProperty('accuracy');
    expect(scores).not.toHaveProperty('overall');
    expect(scores).toHaveProperty('completeness');
  });

  it('leaves fluency and the overall score out when no word was timed', () => {
    const { scores } = assessed(
      run(name, (results) => {
        for (const result of results) {
          for (const word of result.NBest[0].Words) {
            word.Offset = null;
          }
        }
      }),
    );
    expect(scores).not.toHaveProperty('fluency');
    expect(scores).not.toHaveProperty('overall');
  });

  it('scores the take without prosody when no piece has a prosody score', () => {
    const { scores } = assessed(
      run(name, (results) => {
        for (const result of results) {
          delete result.NBest[0].PronunciationAssessment.ProsodyScore;
        }
      }),
    );
    expect(scores).not.toHaveProperty('prosody');
    expect(scores.overall).toBeGreaterThan(0);
  });

  it('keeps one heard result’s own scores when the others were silent', () => {
    const one = capture(name).results[0];
    const request = { ...requestOf(capture(name)), miscue: false };
    const result = assessed(
      assessmentFromAzure([one, { RecognitionStatus: 'BabbleTimeout' }], request),
    );
    expect(result.scores.fluency).toBe(one.NBest[0].PronunciationAssessment.FluencyScore);
    expect(result.signal?.snrDb).toBe(one.SNR);
  });
});
