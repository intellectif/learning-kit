import * as z from 'zod/v4';
import { UnknownActivityTypeError } from '../errors.js';
import { getActivityTypeDescriptor, registeredActivityTypes } from '../registry/index.js';
import { DictationDataSchema } from './dictation.js';
import { FillInTheBlanksDataSchema } from './fill-in-the-blanks.js';
import { GapSelectDataSchema } from './gap-select.js';
import { ItemGroupSchema, StimulusSchema } from './item-group.js';
import { MultipleChoiceDataSchema } from './multiple-choice.js';
import { ReadAloudDataSchema } from './read-aloud.js';
import { isOwnSchema, standardJsonSchemaOf } from './read-schema.js';
import { WrittenResponseDataSchema } from './written-response.js';

/**
 * JSON Schema (Draft 7) for a `Stimulus`. Structural contract only — the
 * kind/media/body consistency guards are Zod-only.
 */
export const stimulusJsonSchema: Record<string, unknown> = z.toJSONSchema(StimulusSchema, {
  target: 'draft-7',
});

/**
 * JSON Schema (Draft 7) for an `ItemGroup` CONTAINER. Items appear as objects
 * with `type` and `id` only; each item's own contract is `jsonSchemaFor(type)`.
 * For an AI generation pipeline, ask for the group and each item separately
 * rather than a single nested schema — that keeps the per-type schema the
 * registry's, not a copy.
 */
export const itemGroupJsonSchema: Record<string, unknown> = z.toJSONSchema(ItemGroupSchema, {
  target: 'draft-7',
});

/**
 * JSON Schema (Draft 7) representation of the Multiple Choice activity data
 * contract, generated natively by Zod 4. Draft 7 is mandated by Requirement
 * 2.2 for the widest AI-prompt / OpenAPI tooling compatibility. The semantic
 * `.refine()` guards are not representable in JSON Schema and are
 * intentionally omitted — the export captures the *structural* contract only.
 * Since v0.3 the source schemas are loose, so these no longer emit
 * `additionalProperties: false` — the JSON Schema and `validateActivity` now
 * agree on unknown-key handling.
 */
/**
 * JSON Schema (Draft 7) representation of the Gap Select activity data
 * contract. Structural contract only: the six semantic guards — the
 * passage/gap bijection, id uniqueness, the one-choice-source rule, and an
 * answer key that names a choice the gap offers — are Zod-only, as they are
 * for the other types.
 */
export const gapSelectJsonSchema: Record<string, unknown> = z.toJSONSchema(GapSelectDataSchema, {
  target: 'draft-7',
});

/**
 * JSON Schema (Draft 7) representation of the Dictation activity data
 * contract. Structural contract, plus the raw length caps JSON Schema can
 * state in code points as zod counts them — `maxLength` 2000 on a transcript
 * and an accepted transcript, 200 on a rule's `from` and `to`. The twelve
 * semantic guards — a transcript that survives normalisation, the caps after
 * equivalences are applied, distinct candidates, audio only, the
 * slow-recording rules, no captions, no transcript in the title — are
 * Zod-only, as they are for the other types.
 */
export const dictationJsonSchema: Record<string, unknown> = z.toJSONSchema(DictationDataSchema, {
  target: 'draft-7',
});

/**
 * JSON Schema (Draft 7) representation of the Read Aloud activity data
 * contract. Structural contract, plus the raw cap JSON Schema can state in code
 * points as zod counts them — `maxLength` 2000 on the reference text — and the
 * canonical locale pattern. The ten semantic guards — the cap after
 * normalisation, a text that survives it, the spaced-script rule, the
 * model-recording rules, unique dimensions, a weight above 0, and the take
 * bounds — are Zod-only, as they are for the other types.
 */
export const readAloudJsonSchema: Record<string, unknown> = z.toJSONSchema(ReadAloudDataSchema, {
  target: 'draft-7',
});

export const multipleChoiceJsonSchema: Record<string, unknown> = z.toJSONSchema(
  MultipleChoiceDataSchema,
  {
    target: 'draft-7',
  },
);

/**
 * JSON Schema (Draft 7) representation of the Fill-in-the-Blanks activity data
 * contract, generated natively by Zod 4. Structural contract only (semantic
 * `.refine()` guards are Zod-only and not representable in JSON Schema).
 */
export const fillInTheBlanksJsonSchema: Record<string, unknown> = z.toJSONSchema(
  FillInTheBlanksDataSchema,
  {
    target: 'draft-7',
  },
);

/**
 * JSON Schema (Draft 7) representation of the Written Response activity data
 * contract. Structural contract only.
 */
export const writtenResponseJsonSchema: Record<string, unknown> = z.toJSONSchema(
  WrittenResponseDataSchema,
  {
    target: 'draft-7',
  },
);

/** The JSON Schema drafts the SDK writes. */
export type JsonSchemaTarget = 'draft-2020-12' | 'draft-7';

/** What the Standard JSON Schema converter calls each draft. */
const STANDARD_TARGET = { 'draft-7': 'draft-07', 'draft-2020-12': 'draft-2020-12' } as const;

/**
 * Derives the JSON Schema for any REGISTERED activity type — the live,
 * registry-backed replacement for the static per-type exports above, and the
 * building block for AI generation pipelines (R6.1): pass the result as a
 * structured-output schema so a model can only emit valid items.
 *
 * Draft 7 unless `target` says `'draft-2020-12'`. For a type you registered,
 * it is the descriptor's `jsonSchema` when you gave one, in whatever draft you
 * wrote it, or else what the schema produces through the Standard JSON Schema
 * converter (`'~standard'.jsonSchema`) in the draft asked for — a zod 4.6
 * schema has one. A fresh copy every call.
 *
 * @throws UnknownActivityTypeError when `type` has no registered descriptor.
 * @throws Error when a registered type has neither a `jsonSchema` nor a schema
 *   that can produce one.
 */
export function jsonSchemaFor(
  type: string,
  options: { target?: JsonSchemaTarget } = {},
): Record<string, unknown> {
  const target = options.target ?? 'draft-7';
  const descriptor = getActivityTypeDescriptor(type);
  if (descriptor === undefined) {
    throw new UnknownActivityTypeError(type);
  }
  if (isOwnSchema(descriptor.schema)) {
    return z.toJSONSchema(descriptor.schema as never, { target }) as Record<string, unknown>;
  }
  if (descriptor.jsonSchema !== undefined) {
    return structuredClone(descriptor.jsonSchema) as Record<string, unknown>;
  }
  const generated = standardJsonSchemaOf(descriptor.schema, STANDARD_TARGET[target]);
  if (generated === undefined) {
    throw new Error(
      `Activity type "${descriptor.type}" has no JSON Schema: its schema implements no Standard JSON Schema converter ('~standard'.jsonSchema). Give its descriptor a \`jsonSchema\`.`,
    );
  }
  return generated;
}

/** A schema without its `$schema`, to sit inside another document. */
function body(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _draft, ...rest } = schema;
  return rest;
}

/**
 * One JSON Schema document for content an outside tool writes: the root is a
 * `SequenceEntry` — an activity of any registered type, or an item group whose
 * items are typed too. Each type, the stimulus and the item group sit under
 * `$defs` (`definitions` in draft 7), so a tool can also point at one of them.
 * Draft 2020-12 unless `target` says `'draft-7'`.
 *
 * Structural, as every exported schema is: rules that span fields (one key in
 * a single-answer question, a blank for each marker, a slow recording that is
 * another file) cannot be written in JSON Schema. On import, `validateDraft`
 * and `validateItemGroupDraft` decide. It includes the author-only fields
 * (`transcript`, `script`), so a tool can write them.
 *
 * ```ts
 * writeFileSync('schema.json', JSON.stringify(contentJsonSchema(), null, 2));
 * ```
 */
export function contentJsonSchema(
  options: { target?: JsonSchemaTarget } = {},
): Record<string, unknown> {
  const target = options.target ?? 'draft-2020-12';
  const definitions = target === 'draft-7' ? 'definitions' : '$defs';
  const ref = (name: string) => ({ $ref: `#/${definitions}/${name}` });
  const types = registeredActivityTypes();
  const anyActivity = { oneOf: types.map(ref) };

  const group = body(z.toJSONSchema(ItemGroupSchema, { target }) as Record<string, unknown>);
  const properties = group.properties as Record<string, Record<string, unknown>>;
  group.properties = {
    ...properties,
    stimulus: ref('stimulus'),
    // The container's own rule for an item (a `type`, an `id`, a `slotKey`),
    // and the item's type's whole contract.
    items: { ...properties.items, items: { allOf: [properties.items?.items, anyActivity] } },
  };

  return {
    $schema:
      target === 'draft-7'
        ? 'http://json-schema.org/draft-07/schema#'
        : 'https://json-schema.org/draft/2020-12/schema',
    title: 'SequenceEntry',
    description:
      'One entry of a question set or an exam section: an activity, or an item group. Structural only: validateDraft and validateItemGroupDraft decide.',
    oneOf: [...types.map(ref), ref('item-group')],
    [definitions]: {
      ...Object.fromEntries(types.map((type) => [type, body(jsonSchemaFor(type, { target }))])),
      stimulus: body(z.toJSONSchema(StimulusSchema, { target }) as Record<string, unknown>),
      'item-group': group,
    },
  };
}
