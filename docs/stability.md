# Stability

What `@intellectif/lk-core` 1.x and `@intellectif/lk-react` 23.x promise, and what they don't.
Versions follow [semantic versioning](https://semver.org): anything this page says is covered changes
only in a **major**.

- [The two version numbers](#the-two-version-numbers)
- [Grades](#grades)
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

## The public API

- **Every export recorded in `packages/lk-core/api/surface.md` and `packages/lk-react/api/surface.md`
  is covered**, types included. CI fails when the exports differ from those files, so a change to the
  public API is always a visible decision in review.
- **Only the entry points in each package's `exports` map are public.** A deep import into `dist/`
  is not.
- **lk-react's surface also includes** what a page styles and translates: the `LkStrings` keys, the
  `--lk-*` custom properties, and the class hooks and data attributes documented in
  [Styling](./styling.md), such as the marking contracts.

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

## Runtimes

- **Node.js 22 or later** (lk-core's `engines`), and **React 19** (lk-react's peer). Requiring a newer
  version of either is a major.
- **ES modules and CommonJS** are both published, with types for both.
