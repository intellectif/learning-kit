import { describe, expectTypeOf, it } from 'vitest';
import type {
  composeGraph,
  GraphComposition,
  GraphValidation,
  Issue,
  ItemsValidation,
  PracticeItem,
  ResolvedPracticeConfig,
  SkillEdge,
  SkillGraph,
  SkillNode,
  validateGraph,
  validateItems,
} from '../index.js';

describe('the public types', () => {
  it('give the graph functions their documented signatures', () => {
    expectTypeOf<typeof validateGraph>().parameter(0).toBeUnknown();
    expectTypeOf<typeof validateGraph>()
      .parameter(1)
      .toEqualTypeOf<ResolvedPracticeConfig | undefined>();
    expectTypeOf<typeof validateGraph>().returns.toEqualTypeOf<GraphValidation>();
    expectTypeOf<typeof validateItems>().returns.toEqualTypeOf<ItemsValidation>();
    expectTypeOf<typeof composeGraph>().returns.toEqualTypeOf<GraphComposition>();
  });

  // The bodies below are checked by the compiler only; they are never run.
  it('narrow a result on ok', () => {
    const check = (result: GraphValidation) => {
      if (result.ok) {
        expectTypeOf(result.graph).toEqualTypeOf<SkillGraph>();
      } else {
        expectTypeOf(result.issues).toEqualTypeOf<readonly Issue[]>();
      }
    };
    expectTypeOf(check).toBeFunction();
  });

  it('make an edge kind decide its fields', () => {
    const check = (edge: SkillEdge) => {
      if (edge.kind === 'prerequisite') {
        expectTypeOf(edge.strength).toEqualTypeOf<'hard' | 'soft'>();
      } else {
        expectTypeOf(edge.weight).toEqualTypeOf<number>();
      }
    };
    expectTypeOf(check).toBeFunction();
  });

  it('reject an explicit undefined for an optional field (exactOptionalPropertyTypes)', () => {
    const fine: SkillNode = { id: 'a', knowledge: 'procedural' };
    // @ts-expect-error an absent optional is not undefined
    const skill: SkillNode = { id: 'a', knowledge: 'procedural', stages: undefined };
    // @ts-expect-error same for an item
    const item: PracticeItem = { ...({} as PracticeItem), difficulty: undefined };
    expectTypeOf(fine).toEqualTypeOf<SkillNode>();
    expectTypeOf(skill).not.toBeAny();
    expectTypeOf(item).not.toBeAny();
  });

  it('keep every graph field read-only', () => {
    const check = (graph: SkillGraph) => {
      // @ts-expect-error read-only
      graph.version = 'x';
      // @ts-expect-error read-only array
      graph.skills.push({ id: 'a', knowledge: 'procedural' });
    };
    expectTypeOf(check).toBeFunction();
  });
});
