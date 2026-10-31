export interface VariantVectorCase {
  name: string;
  call: 'variants' | 'critiqueDrafts';
  input?: unknown;
  reply?: unknown;
  entries?: unknown[];
  expected: unknown;
}

export interface VariantVectorCorpus {
  corpusVersion: string;
  cases: VariantVectorCase[];
}

export function outcomeOf(core: unknown, one: VariantVectorCase): unknown;

export function replayVariants(
  core: unknown,
  corpus: VariantVectorCorpus,
): { name: string; ok: boolean; actual: unknown; expected: unknown }[];
