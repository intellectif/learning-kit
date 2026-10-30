import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReadAloudData } from '@intellectif/lk-core';
import type { AzureAssessmentRequest } from '../types.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** The key every fixture's take is stored under. */
export const TAKE_KEY = 'take-1.wav';

/**
 * A captured Azure response: the settings it was requested with, and its
 * results with their `Id` removed. Synthesised speech, silence or noise: no
 * learner's voice is in any of them.
 */
export interface Capture {
  case: string;
  source: string;
  captured: string;
  api: 'sdk' | 'rest';
  speechSdk?: string;
  audioMs: number;
  request: {
    locale: string;
    referenceText: string;
    miscue: boolean;
    gradingSystem: 'HundredMark' | 'FivePoint';
    phonemeAlphabet?: 'IPA' | 'SAPI';
    prosody?: boolean;
    mode?: 'single-shot' | 'continuous';
    segmentationSilenceTimeoutMs?: number;
  };
  // biome-ignore lint/suspicious/noExplicitAny: raw vendor JSON, read as such in tests
  results: any[];
}

export function capture(name: string): Capture {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Capture;
}

export function captures(): Capture[] {
  return readdirSync(FIXTURES)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => capture(file.slice(0, -'.json'.length)));
}

/** The request a host would pass for this capture. */
export function requestOf(one: Capture): AzureAssessmentRequest {
  const { locale, referenceText, miscue, gradingSystem, phonemeAlphabet } = one.request;
  return {
    locale,
    referenceText,
    recordingKey: TAKE_KEY,
    miscue,
    gradingSystem,
    ...(phonemeAlphabet !== undefined ? { phonemeAlphabet } : {}),
  };
}

/** A copy of a capture's results to change. */
// biome-ignore lint/suspicious/noExplicitAny: raw vendor JSON, changed as such in tests
export function resultsOf(name: string): any[] {
  return structuredClone(capture(name).results);
}

/** The read-aloud item a capture's take answers. */
export function itemOf(one: Capture): ReadAloudData {
  return {
    schemaVersion: '1.0',
    type: 'read-aloud',
    id: 'ra-capture',
    title: 'Read the text aloud',
    referenceText: one.request.referenceText,
    locale: one.request.locale,
    recording: { maxSeconds: 120 },
    scoring: {
      dimensions: [
        { name: 'accuracy', weight: 2 },
        { name: 'fluency', weight: 1 },
        { name: 'completeness', weight: 1 },
      ],
    },
  };
}
