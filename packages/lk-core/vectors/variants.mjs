/**
 * Replays `variants.json`: requests, canned model replies and what lk-core made
 * of them, for `aiVariantsRequest` + `checkAiVariants` and the paper codes of
 * `critiqueDrafts`. Ids come from a counter (`id-1`, `id-2`…), so every result
 * is the same on every run.
 *
 * What is recorded is the outcome a host branches on — statuses, codes and
 * their paths, skipped and missing exemplars, pairs, and for the key-balancing
 * case the option order — not the messages, which are English and may be
 * reworded in a minor.
 */

const counter = () => {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
};

const at = (list) => list.map((one) => [one.code, one.path.join('.')]);

/** What a vector records of one case. */
export function outcomeOf(core, one) {
  if (one.call === 'critiqueDrafts') {
    return { findings: at(core.critiqueDrafts(one.entries)) };
  }
  const request = core.aiVariantsRequest(one.input);
  const checked = core.checkAiVariants(one.reply, request, { newId: counter() });
  return {
    skipped: request.skipped.map((skip) => [skip.exemplarIndex, skip.code]),
    ...(checked.ok
      ? {
          variants: checked.variants.variants.map((variant) => ({
            exemplar: variant.exemplarIndex,
            status: variant.status,
            issues: at(variant.validation.issues),
            mismatches: at(variant.mismatches),
            findings: at(variant.findings),
            pairs: variant.pairs.length,
            ...(variant.entry.type === 'multiple-choice'
              ? { options: variant.entry.options.map((option) => option.text) }
              : {}),
          })),
          missing: checked.variants.missing.map((missing) => missing.exemplarIndex),
          findings: at(checked.variants.findings),
        }
      : { refusal: checked.refusal }),
  };
}

/**
 * Replays every case against `core` — `import * as core from '@intellectif/lk-core'`
 * — and returns one result per case: `ok`, and what came back beside what was
 * recorded.
 */
export function replayVariants(core, corpus) {
  return corpus.cases.map((one) => {
    const actual = outcomeOf(core, one);
    return {
      name: one.name,
      ok: JSON.stringify(actual) === JSON.stringify(one.expected),
      actual,
      expected: one.expected,
    };
  });
}
