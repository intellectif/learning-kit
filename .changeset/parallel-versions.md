---
'@intellectif/lk-core': minor
---

**Parallel forms of an exam: a model writes variants of existing items, the critic reads a whole paper, and `critiqueVersions` compares two forms**

**Action required:** none. Everything is new except `critiqueDrafts`, which now also reports the paper codes below over every item of a set, groups' items included: an editor that lists findings shows them, and translates them by `code` like any other.

- **`aiVariantsRequest`, `checkAiVariants`, `aiVariantsRepairRequest`, `generateVariants`**, the shape of the drafting functions: a model writes a parallel version of each exemplar — loose items and whole parts, a new passage or listening script included — keeping its type, structure, scoring and settings, which the SDK copies back whatever the reply says. Each exemplar's facts carry targets the SDK computed (counts, lengths in words, difficulty and its levers), and each variant comes back with a status, `mismatches` (`variant_type`, `variant_structure`), findings (`variant_length`, `variant_near_copy`, `variant_same_key`, against the exemplar and every other form) and `pairs` lining its items up with the exemplar's. A recording comes back with no file and its new script; a picture is described anew or reused. Exemplars that cannot be varied are listed in `skipped`; `balanceKeyPositions` spreads single-answer keys from a seed.
- **The paper critic:** `set_key_position_bias`, `set_key_longest_bias`, `set_stem_duplicate`, `set_item_answers_item` and `set_key_repeated`, each naming the other items involved in the new `related` of a finding; and `fib_tolerance_spans_words`, for a blank whose forgiven edits run over an answer of several words.
- **`critiqueVersions(a, b)`:** two forms slot by slot — paired by given pairs, `slotKey` or position — for blueprint, type, structure, objectives and length, and paper against paper for near copies, shared keys and shared files.
- **`vectors/variants.json`** with `vectors/variants.mjs`: requests, canned replies and outcomes to replay against the build you install; the AI check kit gains a `variants` port and ten cases.
- **Why a minor:** additive. No scoring, validation or stored content changes.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/ai.md#variants-of-existing-items-18
