import { describe, expect, it, vi } from 'vitest';
import type { XAPIActor, XAPIContext } from '../../types/index.js';
import {
  validateXAPIStatement,
  XAPI_VERB_DISPLAY,
  XAPIVerb,
  xAPIBuilder,
  xapiDefinitionFor,
} from '../index.js';

const actor: XAPIActor = { objectType: 'Agent', mbox: 'mailto:l@example.com' };
const object = { id: 'https://example.com/act/written-1' };

describe('XAPIVerb.SUBMITTED', () => {
  it('maps to the Activity Streams 1.0 submit IRI', () => {
    expect(XAPIVerb.SUBMITTED).toBe('http://activitystrea.ms/schema/1.0/submit');
  });

  it('has a display entry', () => {
    expect(XAPI_VERB_DISPLAY.SUBMITTED).toEqual({ 'en-US': 'submitted' });
  });
});

describe('xAPIBuilder.buildSubmittedStatement', () => {
  it('uses the SUBMITTED verb IRI and display', () => {
    const s = xAPIBuilder.buildSubmittedStatement({ actor, object, timeSpentMs: 1000 });
    expect(s.verb.id).toBe(XAPIVerb.SUBMITTED);
    expect(s.verb.display).toEqual({ 'en-US': 'submitted' });
  });

  it('result carries duration and response but no score/success/completion', () => {
    const s = xAPIBuilder.buildSubmittedStatement({
      actor,
      object,
      timeSpentMs: 5400,
      response: 'my essay text',
    });
    expect(s.result).toBeDefined();
    expect(s.result?.duration).toBe('PT5.40S');
    expect(s.result?.response).toBe('my essay text');
    expect('score' in (s.result ?? {})).toBe(false);
    expect('success' in (s.result ?? {})).toBe(false);
    expect('completion' in (s.result ?? {})).toBe(false);
  });

  it('omits response and extensions keys when not provided', () => {
    const s = xAPIBuilder.buildSubmittedStatement({ actor, object, timeSpentMs: 0 });
    expect(s.result).toEqual({ duration: 'PT0.00S' });
    expect('response' in (s.result ?? {})).toBe(false);
    expect('extensions' in (s.result ?? {})).toBe(false);
  });

  it('passes resultExtensions through to result.extensions', () => {
    const extensions = {
      'https://example.com/ext/attempt': 2,
      'https://example.com/ext/mode': 'deferred',
    };
    const s = xAPIBuilder.buildSubmittedStatement({
      actor,
      object,
      timeSpentMs: 100,
      resultExtensions: extensions,
    });
    expect(s.result?.extensions).toEqual(extensions);
  });

  it('passes context through unchanged and omits it when absent', () => {
    const context: XAPIContext = {
      platform: 'web',
      language: 'en-US',
      contextActivities: {
        parent: [{ objectType: 'Activity', id: 'urn:x' }],
      },
    };
    const withContext = xAPIBuilder.buildSubmittedStatement({
      actor,
      object,
      timeSpentMs: 100,
      context,
    });
    expect(withContext.context).toEqual(context);

    const withoutContext = xAPIBuilder.buildSubmittedStatement({ actor, object, timeSpentMs: 100 });
    expect('context' in withoutContext).toBe(false);
  });

  it('stamps id (UUID v4), timestamp, and version', () => {
    const s = xAPIBuilder.buildSubmittedStatement({ actor, object, timeSpentMs: 1 });
    expect(s.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(Number.isNaN(Date.parse(s.timestamp))).toBe(false);
    expect(s.version).toBe('1.0.3');
  });

  it('produces statements that pass validateXAPIStatement', () => {
    const s = xAPIBuilder.buildSubmittedStatement({
      actor,
      object,
      timeSpentMs: 2500,
      response: 'answer',
      resultExtensions: { 'https://example.com/ext/k': 1 },
      context: { contextActivities: { parent: [{ objectType: 'Activity', id: 'urn:x' }] } },
    });
    // Building without throwing already proves internal validation passed;
    // the explicit call confirms the emitted statement is structurally valid.
    expect(() => validateXAPIStatement(s)).not.toThrow();
  });
});

describe('duration formatting (msToIsoDuration via buildSubmittedStatement)', () => {
  it.each([
    [5400, 'PT5.40S'],
    [0, 'PT0.00S'],
    [449, 'PT0.45S'],
    [123456, 'PT123.46S'],
  ])('timeSpentMs %d => %s', (timeSpentMs, expected) => {
    const s = xAPIBuilder.buildSubmittedStatement({ actor, object, timeSpentMs });
    expect(s.result?.duration).toBe(expected);
  });
});

describe('object params with interaction fields (v0.3 XAPIObjectParams additions)', () => {
  const interactionObject = {
    id: 'https://example.com/act/q1',
    name: { 'en-US': 'Question 1' },
    type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
    interactionType: 'choice',
    correctResponsesPattern: ['a[,]b'],
    choices: [
      { id: 'a', description: { 'en-US': 'Option A' } },
      { id: 'b', description: { 'en-US': 'Option B' } },
      { id: 'c' },
    ],
  };

  it('buildStatement lands interactionType/correctResponsesPattern/choices under object.definition', () => {
    const s = xAPIBuilder.buildStatement({ actor, verb: 'ANSWERED', object: interactionObject });
    expect(s.object.id).toBe(interactionObject.id);
    expect(s.object.definition).toEqual({
      name: { 'en-US': 'Question 1' },
      type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
      interactionType: 'choice',
      correctResponsesPattern: ['a[,]b'],
      choices: interactionObject.choices,
    });
  });

  it('buildAnsweredStatement lands the same fields under object.definition', () => {
    const s = xAPIBuilder.buildAnsweredStatement({
      actor,
      object: interactionObject,
      scoringResult: { score: 1, maxScore: 1, passed: true, feedback: null, details: [] },
      timeSpentMs: 3000,
      response: 'a[,]b',
    });
    expect(s.object.definition?.interactionType).toBe('choice');
    expect(s.object.definition?.correctResponsesPattern).toEqual(['a[,]b']);
    expect(s.object.definition?.choices).toEqual(interactionObject.choices);
  });

  it('buildSubmittedStatement lands long-fill-in interaction fields under object.definition', () => {
    const s = xAPIBuilder.buildSubmittedStatement({
      actor,
      object: {
        id: 'https://example.com/act/essay-1',
        interactionType: 'long-fill-in',
      },
      timeSpentMs: 60000,
      response: 'essay body',
    });
    expect(s.object.definition).toEqual({ interactionType: 'long-fill-in' });
  });
});

describe('validateXAPIStatement with contextActivities.parent', () => {
  it('accepts a statement whose context carries a parent activity', () => {
    const s = xAPIBuilder.buildStatement({
      actor,
      verb: 'SUBMITTED',
      object,
      context: {
        contextActivities: { parent: [{ objectType: 'Activity', id: 'urn:x' }] },
      },
    });
    expect(s.context?.contextActivities?.parent).toEqual([{ objectType: 'Activity', id: 'urn:x' }]);
    expect(() => validateXAPIStatement(s)).not.toThrow();
  });
});

describe('statement ids without crypto.randomUUID (non-secure origins)', () => {
  it('builds a valid v4-formatted id via the getRandomValues fallback', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', {
      // Delegate to the real implementation, matching its overloaded generic
      // signature via the bound method rather than re-declaring it.
      getRandomValues: original.getRandomValues.bind(original),
    });
    try {
      const s = xAPIBuilder.buildSubmittedStatement({ actor, object, timeSpentMs: 10 });
      expect(s.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(() => validateXAPIStatement(s)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clamps negative durations to PT0.00S', () => {
    const s = xAPIBuilder.buildSubmittedStatement({ actor, object, timeSpentMs: -500 });
    expect(s.result?.duration).toBe('PT0.00S');
  });
});

describe('xapiDefinitionFor — interop read from the registered descriptor', () => {
  it('derives type, interactionType and correctResponsesPattern for built-ins', () => {
    // These descriptor fields previously had NO reader anywhere: each renderer
    // rebuilt the same strings inline, which is the "declared but never used"
    // defect the SDK fixed elsewhere.
    expect(
      xapiDefinitionFor({
        type: 'multiple-choice',
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B', isCorrect: false },
        ],
      } as never),
    ).toEqual({
      type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
      interactionType: 'choice',
      correctResponsesPattern: ['a'],
    });

    expect(
      xapiDefinitionFor({
        type: 'fill-in-the-blanks',
        blanks: [{ id: 'b1', acceptedAnswers: ['cat'] }],
      } as never),
    ).toMatchObject({ interactionType: 'fill-in', correctResponsesPattern: ['cat'] });
  });

  it('omits an empty correctResponsesPattern rather than emitting a blank one', () => {
    // written-response has no correct answer to publish.
    const definition = xapiDefinitionFor({ type: 'written-response' } as never);
    expect(definition.interactionType).toBe('long-fill-in');
    expect('correctResponsesPattern' in definition).toBe(false);
  });

  it('returns an empty object for an unregistered type, so it is always spreadable', () => {
    expect(xapiDefinitionFor({ type: 'not-registered' })).toEqual({});
  });
});
