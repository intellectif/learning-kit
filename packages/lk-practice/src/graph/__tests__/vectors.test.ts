import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GraphExtension, SkillGraph } from '../../types.js';
import { composeGraph } from '../extension.js';
import { validateGraph, validateItems } from '../validate.js';

/** `vectors/graph.json`: the graph, item and composition corpus (criterion 1). */
interface Case {
  readonly name: string;
  readonly kind: 'graph' | 'items' | 'compose';
  readonly input: Record<string, unknown>;
  readonly expect:
    | { readonly ok: true; readonly warnings: readonly string[]; readonly version?: string }
    | { readonly ok: false; readonly codes: readonly string[] };
}

const corpus = JSON.parse(
  readFileSync(new URL('../../../vectors/graph.json', import.meta.url), 'utf8'),
) as { readonly version: number; readonly cases: readonly Case[] };

function run(vector: Case) {
  switch (vector.kind) {
    case 'graph':
      return validateGraph(vector.input.graph);
    case 'items':
      return validateItems(vector.input.items, vector.input.graph as SkillGraph);
    case 'compose':
      return composeGraph(
        vector.input.base as SkillGraph,
        vector.input.extensions as readonly GraphExtension[],
      );
  }
}

describe('vectors/graph.json', () => {
  it('is version 1 and covers every kind, valid and invalid', () => {
    expect(corpus.version).toBe(1);
    for (const kind of ['graph', 'items', 'compose']) {
      const cases = corpus.cases.filter((vector) => vector.kind === kind);
      expect(cases.some((vector) => vector.expect.ok)).toBe(true);
      expect(cases.some((vector) => !vector.expect.ok)).toBe(true);
    }
    expect(new Set(corpus.cases.map((vector) => vector.name)).size).toBe(corpus.cases.length);
  });

  it.each(corpus.cases.map((vector) => [vector.name, vector] as const))('%s', (_, vector) => {
    const result = run(vector);
    if (vector.expect.ok) {
      expect(result.ok, JSON.stringify(result.ok ? null : result.issues)).toBe(true);
      if (!result.ok) return;
      const warnings = 'warnings' in result ? result.warnings : [];
      expect(warnings.map((warning) => warning.code)).toEqual(vector.expect.warnings);
      if (vector.expect.version !== undefined && 'graph' in result) {
        expect(result.graph.version).toBe(vector.expect.version);
      }
    } else {
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues.map((issue) => issue.code)).toEqual(vector.expect.codes);
    }
  });
});
