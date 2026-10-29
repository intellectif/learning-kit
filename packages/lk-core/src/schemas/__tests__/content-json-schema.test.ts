import { describe, expect, it } from 'vitest';
import { BUILT_IN_ACTIVITY_TYPES } from '../../built-in-types.js';
import {
  contentJsonSchema,
  jsonSchemaFor,
  multipleChoiceJsonSchema,
  stimulusJsonSchema,
} from '../index.js';

type Node = Record<string, unknown>;

/** Every `$ref` in a document. */
function refsOf(node: unknown): string[] {
  if (Array.isArray(node)) {
    return node.flatMap(refsOf);
  }
  if (typeof node !== 'object' || node === null) {
    return [];
  }
  return Object.entries(node).flatMap(([key, value]) =>
    key === '$ref' && typeof value === 'string' ? [value] : refsOf(value),
  );
}

/** What a local `$ref` points at, or undefined. */
function resolve(document: Node, ref: string): unknown {
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<unknown>((at, key) => (at as Node | undefined)?.[key], document);
}

describe('contentJsonSchema', () => {
  it('is one draft 2020-12 document whose root is a sequence entry', () => {
    const document = contentJsonSchema();
    expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(document.oneOf).toEqual([
      ...BUILT_IN_ACTIVITY_TYPES.map((type) => ({ $ref: `#/$defs/${type}` })),
      { $ref: '#/$defs/item-group' },
    ]);
    expect(Object.keys(document.$defs as Node).sort()).toEqual(
      [...BUILT_IN_ACTIVITY_TYPES, 'stimulus', 'item-group'].sort(),
    );
  });

  it('resolves every reference inside itself, in either draft', () => {
    for (const target of ['draft-2020-12', 'draft-7'] as const) {
      const document = contentJsonSchema({ target });
      const refs = refsOf(document);
      expect(refs.length).toBeGreaterThan(BUILT_IN_ACTIVITY_TYPES.length);
      for (const ref of refs) {
        expect(resolve(document, ref), `${target} ${ref}`).toBeTypeOf('object');
      }
    }
    const draft7 = contentJsonSchema({ target: 'draft-7' });
    expect(draft7.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(draft7).not.toHaveProperty('$defs');
    expect(refsOf(draft7).every((ref) => ref.startsWith('#/definitions/'))).toBe(true);
  });

  it('types a group’s items, and keeps each nested schema free of its own $schema', () => {
    const defs = contentJsonSchema().$defs as Record<string, Node>;
    const group = defs['item-group'] as { properties: Record<string, Node> };
    expect(group.properties.stimulus).toEqual({ $ref: '#/$defs/stimulus' });
    const items = group.properties.items as { items: { allOf: Node[] } };
    expect(items.items.allOf[1]).toEqual({
      oneOf: BUILT_IN_ACTIVITY_TYPES.map((type) => ({ $ref: `#/$defs/${type}` })),
    });
    // The container's own rule for an item still requires a type and an id.
    expect(items.items.allOf[0]?.required).toEqual(expect.arrayContaining(['type', 'id']));
    for (const [name, schema] of Object.entries(defs)) {
      expect(schema, name).not.toHaveProperty('$schema');
    }
    for (const type of BUILT_IN_ACTIVITY_TYPES) {
      expect((defs[type] as { properties: Record<string, Node> }).properties.type).toEqual({
        type: 'string',
        const: type,
      });
    }
  });

  it('describes the author-only fields, so a tool can write them', () => {
    const defs = contentJsonSchema().$defs as Record<string, { properties: Record<string, Node> }>;
    const media = defs['multiple-choice']?.properties.media as { properties: Node };
    expect(Object.keys(media.properties)).toEqual(expect.arrayContaining(['transcript', 'script']));
    expect(Object.keys(defs.stimulus?.properties ?? {})).toEqual(
      expect.arrayContaining(['transcript', 'script']),
    );
  });

  it('matches the committed document', async () => {
    // A change here is a change to what outside tools are told content looks
    // like: review the diff, then update the file with `vitest -u`.
    await expect(`${JSON.stringify(contentJsonSchema(), null, 2)}\n`).toMatchFileSnapshot(
      './__snapshots__/content.schema.json.snap',
    );
  });
});

describe('jsonSchemaFor', () => {
  it('stays draft 7 by default, and writes draft 2020-12 when asked', () => {
    expect(jsonSchemaFor('multiple-choice')).toEqual(multipleChoiceJsonSchema);
    expect(multipleChoiceJsonSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(stimulusJsonSchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    const modern = jsonSchemaFor('multiple-choice', { target: 'draft-2020-12' });
    expect(modern.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(modern.properties).toEqual(multipleChoiceJsonSchema.properties);
  });
});
