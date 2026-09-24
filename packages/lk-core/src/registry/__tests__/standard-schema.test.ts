import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { validateDraft } from '../../authoring/index.js';
import { assertRedacted, redact } from '../../redact.js';
import {
  jsonSchemaFor,
  validateActivity,
  validateItemGroup,
  validateMedia,
  validateOptionMedia,
} from '../../schemas/index.js';
import type { StandardSchemaV1 } from '../../standard-schema.js';
import type { ActivityType } from '../../types/index.js';
import { defineActivityType, registerActivityType } from '../index.js';

/**
 * A registered type's schema is a Standard Schema, whatever library wrote it.
 * What is under test is the contract a host relies on: a schema from another
 * library validates, drafts and redacts like a zod one; a zod schema needs no
 * adapter and keeps what zod can tell; and what cannot work is refused where
 * the mistake is made, with a message that says what to do.
 */

interface Poll {
  type: string;
  schemaVersion: '1.0';
  id: string;
  title: string;
  question: string;
  secret?: string;
}

/**
 * A schema written by hand to the specification — no library — the way a
 * valibot or ArkType schema presents itself to lk-core.
 */
function handSchema(
  type: string,
  options: { strict?: boolean; codes?: boolean } = {},
): StandardSchemaV1<unknown, Poll> {
  return {
    '~standard': {
      version: 1,
      vendor: 'by-hand',
      validate(value) {
        const issues: StandardSchemaV1.Issue[] = [];
        const record = (value ?? {}) as Record<string, unknown>;
        if (record.type !== type) {
          issues.push({ message: `type must be "${type}"`, path: ['type'] });
        }
        for (const key of ['id', 'title', 'question'] as const) {
          if (typeof record[key] !== 'string' || record[key] === '') {
            issues.push({
              message: `${key} must be text`,
              // A path segment may be an object with a `key`.
              path: [{ key }],
              ...(options.codes === true ? { code: 'poll_text' } : {}),
            });
          }
        }
        if (options.strict === true && 'secret' in record) {
          issues.push({ message: 'secret must not reach a learner', path: ['secret'] });
        }
        return issues.length > 0 ? { issues } : { value: value as Poll };
      },
    },
  };
}

const poll = (type: string, over: Record<string, unknown> = {}) => ({
  type,
  schemaVersion: '1.0',
  id: 'p1',
  title: 'Lunch',
  question: 'Pizza or pasta?',
  secret: 'pasta',
  ...over,
});

const scoring = { kind: 'deferred', reason: 'requires_async_grading' } as const;

describe('a schema from any library', () => {
  const type = 'std-poll-hand';
  registerActivityType(
    defineActivityType<Poll, unknown>({
      type,
      schema: handSchema(type),
      redactedSchema: handSchema(type, { strict: true }),
      fieldPolicy: {
        schemaVersion: 'public',
        type: 'public',
        id: 'public',
        title: 'public',
        question: 'public',
        secret: 'answer-key',
      },
      jsonSchema: { type: 'object', required: ['question'] },
      scoring,
    }),
  );

  it('validates, with each issue at its path, named "invalid" when its library gives no code', () => {
    expect(validateActivity(type as ActivityType, poll(type)).success).toBe(true);
    expect(validateActivity(type as ActivityType, poll(type, { question: '' }))).toEqual({
      success: false,
      errors: [{ path: ['question'], message: 'question must be text', code: 'invalid' }],
    });
  });

  it('reports a null at an issue’s path as null_not_allowed in a draft, and a checked path in its own words', () => {
    expect(validateDraft(type as ActivityType, poll(type, { title: null })).issues).toEqual([
      expect.objectContaining({ code: 'null_not_allowed', path: ['title'] }),
    ]);
    expect(validateDraft(type as ActivityType, poll(type, { title: 'Lunch' })).status).toBe(
      'complete',
    );
  });

  it('redacts, and proves the redaction, with its own redacted schema', () => {
    const redacted = redact(poll(type) as never);
    expect(redacted).not.toHaveProperty('secret');
    expect(() => assertRedacted(redacted)).not.toThrow();
    let refused: unknown;
    try {
      assertRedacted({ ...redacted, secret: 'pasta' });
    } catch (error) {
      refused = error;
    }
    expect(refused).toMatchObject({
      errors: [{ path: ['secret'], message: 'secret must not reach a learner', code: 'invalid' }],
    });
  });

  it('validates as an item of a group', () => {
    const group = {
      schemaVersion: '1.0',
      type: 'item-group',
      id: 'g1',
      stimulus: { id: 's1', kind: 'text', body: 'A menu.' },
      items: [poll(type, { question: '' })],
    };
    expect(validateItemGroup(group)).toEqual({
      success: false,
      errors: [
        { path: ['items', '0', 'question'], message: 'question must be text', code: 'invalid' },
      ],
    });
  });

  it('reads a schema by its vendor, not by the methods it happens to have', () => {
    const type = 'std-poll-safeparse';
    const schema = handSchema(type);
    // A library that is not zod may name a method `safeParse` too. It is read
    // through the standard, never through a method lk-core guessed at.
    Object.assign(schema, {
      safeParse: () => {
        throw new Error('safeParse is zod’s API, and this is not zod');
      },
    });
    registerActivityType(defineActivityType<Poll, unknown>({ type, schema, scoring }));
    expect(validateActivity(type as ActivityType, poll(type)).success).toBe(true);
  });

  it('reads a failure at a path that runs through a null, without throwing', () => {
    const type = 'std-poll-deep';
    const deep: StandardSchemaV1<unknown, Poll> = {
      '~standard': {
        version: 1,
        vendor: 'by-hand',
        validate: () => ({ issues: [{ message: 'alt is required', path: ['media', 'alt'] }] }),
      },
    };
    registerActivityType(defineActivityType<Poll, unknown>({ type, schema: deep, scoring }));
    expect(validateDraft(type as ActivityType, poll(type, { media: null })).issues).toEqual([
      expect.objectContaining({ path: ['media', 'alt'], message: 'alt is required' }),
    ]);
  });

  it('keeps the code its library gives', () => {
    const coded = 'std-poll-coded';
    registerActivityType(
      defineActivityType<Poll, unknown>({
        type: coded,
        schema: handSchema(coded, { codes: true }),
        scoring,
      }),
    );
    expect(validateActivity(coded as ActivityType, poll(coded, { id: '' }))).toMatchObject({
      errors: [{ path: ['id'], code: 'poll_text' }],
    });
  });

  it('gives jsonSchemaFor the descriptor’s own JSON Schema, a fresh copy each time', () => {
    const first = jsonSchemaFor(type);
    expect(first).toEqual({ type: 'object', required: ['question'] });
    (first.required as string[]).push('mutated');
    expect(jsonSchemaFor(type)).toEqual({ type: 'object', required: ['question'] });
  });
});

describe('a zod schema', () => {
  const type = 'std-poll-zod';
  const schema = z.looseObject({
    type: z.literal(type),
    schemaVersion: z.literal('1.0'),
    id: z.string().min(1),
    title: z.string().min(1),
    question: z.string().min(1),
  });
  // No cast: a zod 4 schema is a Standard Schema as written.
  registerActivityType(defineActivityType({ type, schema, scoring }));

  it('keeps zod’s codes', () => {
    expect(validateActivity(type as ActivityType, poll(type, { id: '' }))).toMatchObject({
      errors: [{ path: ['id'], code: 'too_small' }],
    });
  });

  it('produces its own JSON Schema, the one zod would', () => {
    expect(jsonSchemaFor(type)).toEqual(z.toJSONSchema(schema, { target: 'draft-7' }));
  });
});

describe('what cannot work is refused where the mistake is made', () => {
  it('refuses a schema that is not a Standard Schema, at registration', () => {
    expect(() =>
      registerActivityType(
        defineActivityType<Poll, unknown>({
          type: 'std-not-standard',
          schema: { parse: () => ({}) } as never,
          scoring,
        }),
      ),
    ).toThrow(/`schema` must implement Standard Schema v1/);
    expect(() =>
      registerActivityType(
        defineActivityType<Poll, unknown>({
          type: 'std-bad-redacted',
          schema: handSchema('std-bad-redacted'),
          redactedSchema: {} as never,
          scoring,
        }),
      ),
    ).toThrow(/`redactedSchema` must implement Standard Schema v1/);
    expect(() =>
      registerActivityType(
        defineActivityType<Poll, unknown>({
          type: 'std-bad-json',
          schema: handSchema('std-bad-json'),
          jsonSchema: [] as never,
          scoring,
        }),
      ),
    ).toThrow(/`jsonSchema` must be a JSON Schema object/);
    // A later version of the standard, or a schema that cannot validate, is
    // not one lk-core can read.
    for (const props of [
      { version: 2, vendor: 'by-hand', validate: () => ({ value: {} }) },
      { version: 1, vendor: 'by-hand' },
    ]) {
      expect(() =>
        registerActivityType(
          defineActivityType<Poll, unknown>({
            type: `std-bad-props-${props.version}`,
            schema: { '~standard': props } as never,
            scoring,
          }),
        ),
      ).toThrow(/`schema` must implement Standard Schema v1/);
    }
  });

  it('refuses a schema that validates asynchronously, and never leaves its Promise to reject unobserved', async () => {
    const type = 'std-poll-async';
    const asyncSchema = (outcome: 'resolve' | 'reject'): StandardSchemaV1<unknown, Poll> => ({
      '~standard': {
        version: 1,
        vendor: 'by-hand',
        validate: (value) =>
          outcome === 'resolve'
            ? Promise.resolve({ value: value as Poll })
            : Promise.reject(new Error('the schema threw')),
      },
    });
    registerActivityType(
      defineActivityType<Poll, unknown>({ type, schema: asyncSchema('reject'), scoring }),
    );
    expect(() => validateActivity(type as ActivityType, poll(type))).toThrow(
      /Activity type "std-poll-async" has a schema whose validation returned a Promise/,
    );
    // An unhandled rejection would fail this run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resolving = 'std-poll-async-ok';
    registerActivityType(
      defineActivityType<Poll, unknown>({
        type: resolving,
        schema: asyncSchema('resolve'),
        scoring,
      }),
    );
    expect(() => validateDraft(resolving as ActivityType, poll(resolving))).toThrow(TypeError);
  });

  it('says what to give when a registered type has no JSON Schema', () => {
    const type = 'std-poll-no-json';
    registerActivityType(
      defineActivityType<Poll, unknown>({ type, schema: handSchema(type), scoring }),
    );
    expect(() => jsonSchemaFor(type)).toThrow(/Give its descriptor a `jsonSchema`/);
  });
});

describe('validateMedia and validateOptionMedia', () => {
  const item = (media: unknown) => ({
    schemaVersion: '1.0',
    type: 'multiple-choice',
    id: 'q1',
    title: 'Q',
    question: 'Which?',
    mode: 'single',
    scoringStrategy: 'all-or-nothing',
    options: [
      { id: 'a', text: 'A', isCorrect: true, media },
      { id: 'b', text: 'B', isCorrect: false },
    ],
    media,
  });

  it('accept what an item accepts, and refuse it with the errors an item reports', () => {
    const audio = { type: 'audio', url: 'https://example.com/a.mp3', alt: 'A clip' };
    expect(validateMedia(audio)).toEqual({ success: true, data: audio });
    expect(validateOptionMedia(audio)).toEqual({ success: true, data: audio });

    const unsafe = { type: 'audio', url: 'javascript:alert(1)' };
    const inItem = validateActivity('multiple-choice', item(unsafe));
    expect(inItem.success).toBe(false);
    const errors = inItem.success ? [] : inItem.errors;
    const at = (prefix: string[]) =>
      errors
        .filter((error) => prefix.every((segment, index) => error.path[index] === segment))
        .map((error) => ({ ...error, path: error.path.slice(prefix.length) }));
    const media = validateMedia(unsafe);
    const option = validateOptionMedia(unsafe);
    expect(media.success).toBe(false);
    expect(option.success).toBe(false);
    expect(media.success ? [] : media.errors).toEqual(at(['media']));
    expect(option.success ? [] : option.errors).toEqual(at(['options', '0', 'media']));
  });

  it('refuse what only an item’s media may be on an option', () => {
    const video = { type: 'video', url: 'https://example.com/v.mp4' };
    expect(validateMedia(video).success).toBe(true);
    expect(validateOptionMedia(video).success).toBe(false);
  });
});
