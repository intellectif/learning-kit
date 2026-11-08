# Stability

What `@intellectif/lk-core` 1.x, `@intellectif/lk-react` 23.x, `@intellectif/lk-azure` 2.x, `@intellectif/lk-practice` 0.x and `@intellectif/lk-interactive-activities` 0.x promise, and what they don't.
Versions follow [semantic versioning](https://semver.org): anything this page says is covered changes
only in a **major**.

- [The two version numbers](#the-two-version-numbers)
- [Grades](#grades)
- [Azure results](#azure-results)
- [Practice planning](#practice-planning)
- [Interactive activities](#interactive-activities)
- [The public API](#the-public-api)
- [Content](#content)
- [Registering your own activity types](#registering-your-own-activity-types)
- [What is not covered](#what-is-not-covered)
- [Deprecation](#deprecation)
- [Runtimes](#runtimes)

## The two version numbers

lk-core is at **1.x**. lk-react is at **23.x**: before 1.0, every lk-core minor released a lk-react
major, and it keeps its own number rather than going back.

- **A lk-core minor or patch releases no lk-react at all.** lk-react declares lk-core as a peer,
  `^1.0.0`, and a 1.x release stays inside that range. `scripts/check-release-plan.mjs` proves it on
  every build with the real release tooling, so an upgrade of that tooling cannot quietly bring back a
  lk-react major on every lk-core minor.
- **When lk-react needs a newer lk-core**, its own release says so: its peer range moves up, and the
  changeset names the lk-core version to install beside it.
- **A lk-core major is a lk-react major.**

## Grades

**Anything that can change a grade already recorded is a major, always.** This rule predates 1.0 and
decides every release.

- **The grade-stability corpus** pins it: `vectors/scoring.json`, shipped in the lk-core tarball, holds
  over six hundred scoring calls — every activity type, and the edges a release could plausibly
  change — with the exact value each returned when it was frozen. Each release replays it against its own
  source and its built package, CommonJS and ES module. A release that changes any expectation is a
  major, and its changeset says what the change does to grades already recorded.
- **It is also the conformance suite.** Replay it against the build you install, in your own tests; the
  [corpus README](../packages/lk-core/vectors/README.md) shows how. Each vector is JSON — the function,
  its arguments and the value it returned — so an implementation of the scoring rules somewhere else,
  a server in another language, can be checked against the same corpus.
- **New scoring behaviour is opt-in.** A new tolerance, policy or rounding mode ships switched off, and
  with it off every number is what it was.

## Azure results

`@intellectif/lk-azure` reads an Azure pronunciation assessment response into a `SpeechAssessment`. A
re-map of a stored response is a regrade, so the same rule applies to it as to a grade:

- **The same results and request give the same assessment for the whole of a major.** The tests hold
  the assessment of each of 30 real captured responses, by hash; a change to any of them is a major,
  and its changeset says which responses map differently and what that does to their grades.
- **A refusal that becomes an assessment, or the reverse, is a major too.**
- **It peers on lk-core, as lk-react does:** a lk-core minor or patch releases no lk-azure, and
  `scripts/check-release-plan.mjs` proves it.
- **Azure is not covered.** Microsoft updates its models without an API change, so the same audio can
  come back with other scores. Store the raw response.

## Practice planning

`@intellectif/lk-practice` plans a learner's practice from a log of evidence. It is at **0.x**: under
semantic versioning a `0.x` minor may break, and this package uses minors that way until 1.0. A
patch never changes behaviour.

- **The same log, graph and configuration give the same state and the same plan** for every patch of
  a minor. A change to any default that alters a schedule, an ability, a stage move or a plan is a
  new minor, and its changeset says what changed under **Action required**. From 1.0, it is a major.
  A new option that is off by default is a minor too, and changes nothing until you turn it on.
- **The log keeps its meaning; the state is rebuilt.** Each model and policy has an id and a version,
  and so do the planner and the rules that apply an entry to the state, all hashed into the
  configuration hash every state and log entry carries. Rules that change refuse a state built under
  the old ones (`STATE_CONFIG_MISMATCH`), and `replay` rebuilds it from the log.
- **Stored data carries `schemaVersion: 1`.** A later version that changes the state or the log entry
  ships a migration in `migrateState`, and never drops a log entry.
- **The vectors are the record.** `packages/lk-practice/vectors/` holds the evidence, stage, log,
  plan and contract vectors, generated from the source. A vector that changes is a behaviour change,
  and its release says so.
- **Its public API is `packages/lk-practice/api/surface.md`,** checked by CI like the others, for its
  root, `./lk-core` and `./testing` entries. The `./testing` simulator's draws may change in any minor.
  `./lk-core` copies the lk-core types it reads, and a test against the real lk-core keeps them in
  step; it never imports lk-core.
- **`ts-fsrs` is pinned exactly,** and no `ts-fsrs` type is part of the API. A `ts-fsrs` upgrade that
  changes a schedule is a behaviour change, released as above.
- **It needs Node.js 24 or later.** It is pure: no clock, randomness, network or I/O, which the
  build's tests prove by running it with the clock and the random source trapped.
- **1.0** follows real use: at least 60 days in a code-practice product and 30 days in a
  language-practice product.

## Interactive activities

`@intellectif/lk-interactive-activities` plays hosted What Happens and Cine-Scramble activities. It is
at **0.x**: a `0.x` minor may break, and this package uses minors that way until 1.0. A patch never
changes behaviour.

- **A change that makes stored activity JSON fail `template.validate()`, or validate differently, is
  a new minor,** and its changeset says what to migrate under **Action required**. From 1.0, it is a
  major.
- **Its public API is `packages/lk-interactive-activities/api/surface.md`,** checked by CI like the
  others. Style, motion and font catalog IDs are part of it: removing one is a breaking change.
- **It grades nothing.** Speaking is never scored, and `playerEventToXapi` never puts a score in a
  statement; only a Cine-Scramble order check reports `success`. Adding a score would be a breaking
  change.
- **It has no runtime dependencies and does no I/O of its own:** no network, no storage, no media
  reads. Media loads only from the URLs the host supplies.
- **It peers on lk-core and lk-react.** An lk-core or lk-react major may need a release of it.

## The public API

- **Every export recorded in `packages/lk-core/api/surface.md`, `packages/lk-react/api/surface.md`
  and `packages/lk-azure/api/surface.md` is covered**, types included. CI fails when the exports differ from those files, so a change to the
  public API is always a visible decision in review.
- **Only the entry points in each package's `exports` map are public.** A deep import into `dist/`
  is not.
- **lk-react's surface also includes** what a page styles and translates: the `LkStrings` keys, the
  `--lk-*` custom properties, and the class hooks and data attributes documented in
  [Styling](./styling.md), such as the marking contracts.
- **A minor can add to a type the SDK hands you**: a member of a union — a feature, a refusal, an
  interaction kind — a key of `LkStrings`, or an optional property. Its changeset names each one.
  Give a `switch` over such a union a `default` branch, and it stays correct across minors. A
  translation typed as a complete `LkStrings` shows each new key as a type error until it has one,
  deliberately: a string left untranslated is found at build time. Removing or narrowing any of
  them is a major.

## Content

- **Content with `schemaVersion: '1.0'` is readable by every 1.x release.** When a content change needs
  a new schema version, it comes in a major, and that major reads `1.0` content too.
- **A minor never makes valid content invalid.** A new check that refuses content a release accepted is
  a major — with one exception: a check that stops content from harming a learner, such as an unsafe
  address, can arrive in a minor, and its changeset says so.
- **Validation errors keep their `path` and `code`.** An editor can key on them. The wording of the
  `message` is not covered.
- **Both are enforced, not only promised.** The validation corpus, `vectors/validation.json` in the
  lk-core tarball, records for over three thousand inputs — every field of a set of items removed,
  `null`, of the wrong type, a string at or past a limit, a list with a hole or too many entries —
  whether each validator accepts, and the `path` and `code` of every error it reports. Each release
  replays it against its source and its built package, and a release that changes an expectation is a
  major. The [corpus README](../packages/lk-core/vectors/README.md) shows how to replay it yourself.
- **The validation library is pinned to one exact version.** lk-core validates with zod, privately, and
  depends on exactly one zod release. Moving between zod releases has changed what lk-core accepts
  before, silently — how string lengths are counted, what a later check is handed — so a new zod
  reaches you only in a lk-core release, once the validation corpus replays unchanged. The cost is a second copy of zod in a
  bundle whose own zod is another version.

## Registering your own activity types

`registerActivityType` takes schemas that implement [Standard Schema v1](https://standardschema.dev),
the interface zod, valibot and ArkType implement. A zod 4 schema is one as written. lk-core depends on no
validation library's types: its own use of zod is private and pinned, and a zod release is not a
lk-core major.

- **Validation must be synchronous.** A schema whose validation returns a Promise is refused when it is
  read.
- **A zod 4 schema keeps what zod can tell.** lk-core reads it with zod's own `safeParse`, so a draft
  of your type is reported as precisely as a built-in's, and what your refinement throws reaches you as
  it was thrown.
- **JSON Schema** comes from the descriptor's `jsonSchema` when you give one, or else from the schema's
  Standard JSON Schema converter, which zod 4.6 implements.

- **A minor may add a built-in type.** Its name is then taken: `registerActivityType` refuses a
  second descriptor for it, and a module augmentation that declares it conflicts with the SDK's. Give
  your own types a prefix the SDK will not use, such as `acme-hotspot`. A changeset that adds a
  built-in type names it.

See [Custom activity types end to end](./authoring.md#custom-activity-types-end-to-end).

## What is not covered

- **Markup and class names** that [Styling](./styling.md) does not document.
- **The text of errors and warnings**, and of the English defaults of `LkStrings`. A reworded default
  is a minor, and its changeset says so, since a page that does not translate shows it.
- **Development-only checks**: what a development build warns about, and when.
- **The order of validation errors** in a list.

## Deprecation

A feature is marked `@deprecated`, naming its replacement, for at least one minor before a major
removes it. The changeset of the minor that deprecates it says so, and so does the upgrading guide.

Deprecated now, each still working throughout 1.x:

| Since | What | Instead |
|---|---|---|
| lk-core 1.3 | A fill-in-the-blanks blank's `caseSensitive` and `trimWhitespace` | `match: { caseSensitive, trim }`, which mean the same |
| lk-core 1.3 | `seededShuffle(items, seed)` without a `version` (it draws version 1) | `{ version: 1 }` for an order already recorded, `{ version: 2 }` for new content — a 2.0 may make 2 the default |

## Runtimes

- **Node.js 22 or later** (lk-core's `engines`), and **React 19** (lk-react's peer). Requiring a newer
  version of either is a major. lk-practice needs **Node.js 24 or later**.
- **ES modules and CommonJS** are both published, with types for both.
