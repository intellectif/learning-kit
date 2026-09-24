---
'@intellectif/lk-core': major
'@intellectif/lk-react': major
---

**1.0**: what every 1.x keeps stable, written down, and from now on a lk-core minor releases no lk-react. No grade changes.

**Action required:** only if you read `ScoringDetail.correct`, import a zod schema from lk-core, or register an activity type of your own. Install lk-core 1.0.0 and lk-react 23.0.0 together. Each change and its replacement is in the upgrading guide: https://github.com/intellectif/learning-kit/blob/main/docs/upgrading.md

- **Stability:** grades, the public API, content and runtimes — what a 1.x release may and may not change — are set out in https://github.com/intellectif/learning-kit/blob/main/docs/stability.md. lk-react 23 peers on `@intellectif/lk-core@^1.0.0`, and a lk-core minor or patch releases no lk-react.
- **`ScoringDetail.correct` is removed, and `outcome` is required.** Deprecated since 0.3; on a multiple-choice option it meant "the learner acted rightly on it". Read `outcome`. The grade-stability corpus changed only there: 142 vectors lose `correct`, and no score, pass or feedback moves. A detail stored before 0.3 still carries only `correct`; the SDK's components still read it.
- **Zod is private to lk-core.** No zod schema is exported and no published type names zod, so your app can use any zod, or none. `validateMedia` and `validateOptionMedia` replace `MediaSchema.safeParse` and `MultipleChoiceOptionMediaSchema.safeParse`; `validateActivity`, `validateDraft` and `validateItemGroup` replace the rest. The `*JsonSchema` constants are typed `Record<string, unknown>`, and the `Redacted*` types are written out, unchanged in shape.
- **A type you register takes Standard Schemas** (https://standardschema.dev): `schema` and `redactedSchema` are `StandardSchemaV1`. A zod 4 schema is one as written; valibot and ArkType work too. Validation must be synchronous. `registerActivityType` throws on a value that is not a Standard Schema, and `jsonSchemaFor` on your type needs the descriptor's new `jsonSchema` unless the schema produces JSON Schema itself, as zod 4.6 does.
- **Built on zod 4.6.5, pinned exactly**, instead of the zod 4 preview in zod 3.25. A new zod reaches you only in a lk-core release. If your app uses another version of zod, your bundle carries two copies. Every built-in validation accepts and refuses what it did, checked against 0.21.0 on 28,000 inputs; from 1.0, `vectors/validation.json` in the tarball freezes that for over three thousand inputs, and each release replays it. Two error lists are one error shorter: a speech assessment with a string where a list of phonemes or syllables belongs, and an xAPI statement whose actor's `mbox` is not a `mailto:` address.
- **Fixed (lk-react):** a host's grade whose details carry no `correct` — every detail lk-core 1.0 writes — had all its details dropped, a read-aloud's word marks among them. It is now read.
