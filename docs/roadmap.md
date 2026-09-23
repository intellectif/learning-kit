# learning-kit — SDK Roadmap

**Status:** living document — the roadmap of record for `@intellectif/lk-core` and `@intellectif/lk-react`.
**Last updated:** 2026-09-22

This plan is grounded in a defect audit of the published `lk-core@0.2.1` / `lk-react@1.0.1` packages and in
production feedback from an integrating application: a CEFR-aligned EN/ES/PT language school running real
mid-term and final exams, reading-comprehension assessment, and AI-graded writing. Every audit claim below was
re-verified against source before being acted on; the verdicts are recorded so the reasoning behind each API
decision stays auditable.

> **Binding rule:** this SDK is used for summative assessment. **No change that can alter a historical grade
> ships outside a package major.** Every new matching tolerance, scoring policy, or threshold behaviour is
> opt-in; absent configuration reproduces the previous semantics exactly.

---

## 1. Audit verification results

Every B-claim was adversarially re-verified against `packages/*/src` (not dist). Summary:

| Claim | Verdict | Notes from verification |
| --- | --- | --- |
| B1 pass-threshold contradiction (0.7 code vs 0.6 docs, unexported) | **Confirmed** | Originates in source JSDoc (`types/activity.ts:77,123`), not just dist; appears 4× in shipped declarations (.d.ts + .d.cts). 0.7 is the intended value (README, authoring docs, property tests agree). |
| B2 FIB matching = trim + toLowerCase only | **Confirmed** | Verified empirically: decomposed `está` ≠ composed form. Extra: `toLowerCase()` is locale-insensitive (Turkish `I` mis-grades even when `locale` is authored); whitespace-only accepted answers normalize to `''` and match empty input. |
| B3 `score()` hardcodes `feedback: null` | **Confirmed** | Components select feedback themselves on **`passed`** (not `score === 1`) — a core fix must reproduce exactly that condition. |
| B4 `ScoringDetail.correct` semantics | **Confirmed** | `correct: wasSelected === option.isCorrect` — an unselected wrong option reads `correct: true`. The JSDoc is ambiguous rather than wrong; FIB uses a different meaning for the same field. |
| B5 `ScoringDetail.weight` declared, never written | **Confirmed** | Only occurrence in the monorepo is the declaration. |
| B6 shuffle deterministic per mount only; FIB no shuffle | **Confirmed** | Extra: `crypto.randomUUID()` is called unconditionally on every MC mount → **TypeError on non-secure (plain-http) contexts even with shuffle off**; SSR hydration mismatch unmitigated. |
| B7 Zod strip mode destroys unknown fields | **Confirmed** | All 6 object schemas strip; `validateActivity` returns stripped data. Extra: the exported JSON Schemas emit `additionalProperties: false`, so the two validation paths **disagree** (Zod accepts-and-strips what the JSON Schema rejects). Installed zod 3.25.76 already ships `z.looseObject` — no dependency change needed. |
| B8 `ActivitySequence` stale results | **Confirmed** | Worse than stated: shrinking the set strands the learner on an empty `<div>` with no nav; `onComplete` can fire with a **mixed old/new-set results array**; the unkeyed child reconciles in place across sets. |
| B9 validation holes | **Confirmed** | Duplicate `{{id}}` placeholders AND duplicate `blanks[].id` both pass (set-based bijection); duplicate MC option ids pass (scorer is last-duplicate-wins); `.max(10)` cap confirmed. Media: relative URLs fail but **`javascript:alert(1)` and `ftp:`/`file:` pass** — and the embed `<iframe>` ships **without the `sandbox` attribute** its own docblock claims → stored-XSS surface in consuming apps. |
| B10 xAPI gaps | **Partially confirmed** | Overstated: components emit **only ANSWERED** (even narrower than claimed); duration is *rounded* (<500 ms → `PT0S`), not truncated. Extra (audit missed): `useXAPI` **never applies `XAPIConfig.actor`/`activityId`** — the documented identity-injection contract is dead code; components never set `definition.type`; xAPI `name` language maps hardcode `en-US` even when `locale` is authored. |
| B11 zero i18n / RTL / reduced-motion / JS-only dark mode | **Confirmed** | Full hardcoded-string inventory captured. Nuance: "cannot follow a host theme toggle" is overstated — a host *not* using `ThemeProvider` can override `--lk-*` tokens in CSS today; the limitation binds when `ThemeProvider`/`theme` inline styles are in play. Reduced-motion exposure is minor (150 ms transitions only). |
| §8.1 uncontrolled / self-scoring / key-on-client / escaped text / no mode | **Confirmed** | Precision: the only render-time `isCorrect` read is post-submit — the binding constraint on redacted rendering is **client-side `score()`**, not the render path. `MultipleChoiceData.mode` (single/multi) name-collides with any future practice/exam/review `mode` prop — the new prop must pick another name or namespace. |
| §15 packaging (sideEffects, zod hard dep, React 19-only, engines) | **Partially confirmed** | All confirmed except: npm **provenance is already present** on 0.2.1/1.0.1 via OIDC trusted publishing (audit wrong). Extra: published tarballs contain no LICENSE file; CI tests Node 22 only while release builds on Node 24; no publint/attw/api-extractor semver gate. |
| "Zero call sites" table, three-renderer divergence, consumer line counts | **Unverifiable here** | Integrating application not part of this repo. Treated as credible directional evidence, not fact. |

**Where the audit is right and it matters most:** the strip-mode/JSON-schema disagreement, the deferred-grading
gap (an ungraded written response is indistinguishable from a 0), the redaction gap, and the closed type system
are all real and all verified. **Where we deviate from the audit:** see §3.

---

## 2. What was next on the original roadmap — and what this analysis adds

**Originally next (unchanged in spirit):** Task 25 / Req 22 — promote `written-response` into the SDK. The
audit and the integrating application feedback independently confirm this was the right next item; it ships in v0.3.0.

**What the verified audit adds on top of the original Phase 2/3 list:**

- An entire **correctness backlog (B1–B11)** the original plan did not know about — shipped first, in v0.3.0.
- **Type extensibility (R1 registry)** — replaces the original "Req 15: Plugin Architecture" with a leaner,
  value-level design. The original plan would have added each type by hand-editing unions forever.
- **`redact()` / field sensitivity (R7)** — not in the original plan at all; required by summative use.
- **Deferred scoring as a first-class outcome (`ItemOutcome`)** — generalizes Req 22.6 beyond written-response.
- **Text-match policy (R3.3)** — the accent/normalization fix for an EN/ES/PT school; original plan had none.
- **Assessment composition (R4), headless rendering + controlled components (R5), AI ports (R6), interop (R9),
  new activity types prioritized for ELT (R10)** — replacing the original, less-grounded Phase 2/3 list
  (drag-and-drop, true/false, interactive video) with a gap-analysis-driven order.
- **Reading-comprehension gap (consumer feedback, under-weighted by the audit):** Moodle-style reading
  assessment needs (a) richer in-context item types (`gap-select` dropdown cloze above all) **and** (b) a
  **shared-stimulus group** — one passage/audio serving several questions (testlet). The audit's blueprint has
  sections but no shared-stimulus primitive; we add it explicitly in v0.4.

**Original items retired or re-scoped:** True/False (a UI variant of MC, per gap analysis), Interactive Video
(P2, low value for ELT), Learner Profile/Adaptive hooks (out — consumer-side), IndexedDB offline buffering
(re-scoped to `serializeAttemptState`/`restoreAttemptState` in v0.4). The `lk-server` LRS-proxy package was
**deleted** in the v0.5 line: it sat empty for its whole life with no thesis anyone could state, and an empty
package with no purpose is a liability, not an option held open.

---

## 3. Where we deviate from the audit (deliberate, with reasons)

1. **"v0.3 fully additive" is internally false in the audit: changing `score()` to return `ItemOutcome` is a
   TypeScript-breaking change** (every `result.score` read stops compiling). The original Task 25 knew this
   (it scheduled a major). Resolution: keep `score()`'s signature intact for sync types and ship a **new**
   `evaluate(data, response): ItemOutcome` with `'scored' | 'deferred' | 'unscorable'`. `score()` on a
   deferred-only type throws a typed `DeferredScoringError` instead of silently returning 0. The breaking
   unification (`ItemOutcome` everywhere) lands in v1.0 with codemods. This also supersedes Req 22.6's exact
   union shape — its substance (deferral expressible, `withinWordBounds`/`wordCount` carried) is preserved.
2. **Registry scope:** ship the module-scoped value-level registry only (per audit §15.3 — no `createRegistry`
   instances, no `freeze()`), but v0.3 does **not** ship the full descriptor surface (versions/migrations,
   `plan()`, authoring, ai) — those fields arrive with the features that consume them (v0.4+). Shipping dead
   descriptor fields today would freeze API we haven't validated.
3. **`.max(10)` options cap:** the audit calls it a hole; verification shows it is deliberate. We raise it to
   26 rather than removing it — an unbounded options array is a rendering/authoring hazard.
4. **Media URL policy:** the audit asked for relative-URL support; verification found the real defect is the
   opposite — dangerous schemes pass. v0.3 allows `https:`/`http:`/`data:`/`blob:` **and** root-relative
   (`/...`) URLs, and rejects everything else (`javascript:`, `file:`, `ftp:`). Strictly this invalidates
   previously-"valid" data, but only data that was an XSS payload — shipped as a security fix.
5. **Rounding (R3.4):** deferred, and the design constraint is sharper than "pick a good default". Integrator
   feedback shows rounding is **two different operations that must not share one policy**: *grade* rounding
   (in production: half-up to 2 decimal places with an epsilon nudge, because a learner shown "70%" must not
   be recorded as a fail at 69.6) and *band / level classification*, which deliberately **floors**, because
   over-placement drives dropout. One shared default would silently invert one of them. Therefore: `dp` is
   required with no default, grade rounding and band classification are separate entry points, and `gte()`
   compares rounded values with an epsilon on both sides.
6. **`AttemptPolicy` enforcement, delivery, timers, persistence, identity:** stay consumer-side (agreeing with
   the audit against over-building).
7. **AI posture:** **ports only** — no model client, no API key, no provider dependency in any `lk-*`
   package. The SDK defines the interface; the application supplies the adapter, keeps its own prompts, and
   chooses its own model. This keeps the SDK provider-neutral and keeps model cost/policy where it belongs.
   **Amended 2026-09-22 on where they live:** a separate `@intellectif/lk-ai` package was planned for
   them and is not being built. The checks are the point of the ports, and every check is a reading of the
   SDK's own scorer — `hintRevealsAnswer` is the fill-in-the-blanks matcher, a verdict is `evaluate`'s — so
   they belong beside the scorers in `lk-core`, with their React surface in `lk-react`. A third package
   would have added a third version in the peer cascade for no separation anyone could state. The empty
   placeholder was deleted in the 0.19.0 line, as `lk-server` was before it.

---

## 4. Release plan

> Grade-stability rule (binding, from §2 of the audit — adopted): **no change that alters a historical grade
> ships outside a package major.** Every new matching tolerance, scoring policy, or threshold behavior is
> opt-in; absent configuration reproduces prior semantics exactly.

### v0.3.0 (`lk-core` 0.2.1 → 0.3.0) + 1.1.0 (`lk-react` 1.0.1 → 1.1.0) — "close the holes, open the type system" — **✅ SHIPPED 2026-08-19**

Open follow-ups from this release (small, tracked for v0.4): WrittenResponse Playwright e2e + Storybook
stories; example-app demo of WrittenResponse; `matchedVia` on ScoringDetail (matchText already reports it).

**Pre-release adversarial review (22 agents, 4 lenses, per-finding verification):** confirmed and fixed before
shipping — (a) *blocker:* the new ActivitySequence reset keyed on array reference, wiping exam progress for
parents passing freshly-mapped arrays (now keyed on ordered activity ids, with a regression test reproducing
the original failure); (b) `ScoringDetail.outcome` made optional in the type (required would break 0.2-era
consumer literals; scorers always write it; required again in v1.0); (c) `crypto.randomUUID` at statement-build
time crashed submits on plain-http origins — v4-formatted `getRandomValues` fallback added (this bug predates
this release); (d) `ignorePunctuation` narrowed to `\p{P}` (symbols like `$` are answer substance);
(e) `collapseInnerWhitespace` no longer overrides an explicit `trim: false`; (f) `embed` media restricted to
absolute http(s) (a `data:`/same-origin document in the allow-scripts iframe defeats its sandbox);
(g) `assertRedacted` fails closed when no `redactedSchema` is registered; (h) `XAPIConfig.activityId` accepts a
per-statement mapper so multi-activity pages don't collapse object ids. Decisions recorded, not changed:
schema tightenings stay strict with a loud changeset migration note (no `legacyContent` escape hatch — the
rejected data was always scoring-corrupting; components validate dev-only so prod rendering is unaffected);
the `ActivityType` union widening is documented as the standard minor-version reality for exhaustive switches.

Additive for all existing TypeScript consumers. Fixes every verified correctness defect, promotes
written-response, and opens the type system.

**lk-core 0.3.0**

- [x] C1 — Export `DEFAULT_PASS_THRESHOLD`; fix the 0.6 JSDoc at `types/activity.ts:77,123` (B1).
- [x] C2 — `matchText()` + `TextMatchPolicy` + `TextMatchResult` (`via`); `BlankConfig.match?` wired through the
      FIB scorer. Defaults reproduce today's trim+lowercase semantics bit-for-bit; `normalize: 'NFC'`,
      `foldDiacritics`, `collapseInnerWhitespace`, `ignorePunctuation`, `levenshtein`, `locale` are opt-in (B2, R3.3).
- [x] C3 — `score()` selects `feedback` from `ActivityFeedback` on `passed` (B3).
- [x] C4 — `ScoringDetail.outcome` (`correct | incorrect | correct-omission | incorrect-omission`); `.correct`
      JSDoc-deprecated but still written (B4). `weight: 1` now written by both scorers (B5).
- [x] C5 — Unknown-key preservation: all six schemas switch to `z.looseObject` (B7). Derived JSON Schemas stop
      emitting `additionalProperties: false`, resolving the validate-vs-JSON-schema disagreement.
- [x] C6 — Validation holes closed: option-id uniqueness; blank-id uniqueness + each `{{id}}` placeholder appears
      exactly once; options cap 10 → 26; accepted answers must be non-empty after trimming; media/captions URL
      scheme allow-list (`https` `http` `data` `blob` + root-relative), rejecting `javascript:` et al. (B9 + security).
- [x] C7 — Activity-type registry (R1, lean): `defineActivityType` / `registerActivityType` /
      `getActivityTypeDescriptor` / `registeredActivityTypes`; `ActivityType = keyof ActivityDataMap` +
      `LearnerResponseMap` (module-augmentation-friendly); `validateActivity`/`score`/`evaluate`/`jsonSchemaFor`
      are registry-backed; MC/FIB/WR pre-registered.
- [x] C8 — `evaluate(data, response): ItemOutcome` (`scored | deferred | unscorable`); `DeferredScoringError` from
      `score()` for deferred-only types (§3.1).
- [x] C9 — **Written-response promoted** (Req 22, wire-format byte-compatible): `WrittenResponseData`
      (`prompt`, `promptHtml?`, `minWords`, `maxWords`, `rubric?`, `languageTarget?`, + shared fields),
      `WrittenResponseLearnerResponse` (`text`, `wordCount`), `countWords()`, loose schema, JSON-schema export,
      registered as deferred. xAPI `SUBMITTED` verb (`http://activitystrea.ms/schema/1.0/submit` — design call
      recorded per Task 25.4) + `buildSubmittedStatement` (no `score`/`success`/`completion`).
- [x] C10 — `redact()` + `FieldPolicy` (fail-closed: unclassified ⇒ `answer-key` ⇒ removed) + `assertRedacted()`
      + redacted schemas that validate, for MC/FIB/WR (R7). `scoringStrategy` is classified answer-key (verified
      exploitable). Redacted **rendering** is v0.4.
- [x] C11 — xAPI: `definition.interactionType`/`correctResponsesPattern`/`choices` types + builder passthrough;
      `XAPIContext.contextActivities`; fractional-second durations (`PT1.23S`); `jsonSchemaFor(type)` (B10 slice, R6.1).
- [x] C12 — Packaging: `sideEffects: false`, `engines.node >= 20`, per-package LICENSE files.

**lk-react 1.1.0**

- [x] R1 — `ActivitySequence` resets `index`/`results` when `activities` changes; keyed child; no empty-state
      dead end; no mixed-set `onComplete` (B8 + extras).
- [x] R2 — `shuffleSeed?: string` prop (server-reproducible order, SSR-stable when supplied);
      `crypto.randomUUID` gated behind shuffle-without-seed with a non-crypto fallback (fixes the
      non-secure-context crash) (B6).
- [x] R3 — Components consume `ScoringResult.feedback` from core (identical passed-based behavior) (B3).
- [x] R4 — `<WrittenResponse>` component: labelled textarea, live word count, bounds messaging,
      `onSubmitted(submission)` carrying `text`, `wordCount`, `withinWordBounds`, `timeSpent`, `xapiStatement`
      (deviation from Req 22.8's `onComplete`: no fake score is ever emitted — see §3.1). Subpath export + skin.
      `ActivitySequence` dispatch for WR deferred to v0.4 (typing it today would break `onComplete`'s signature).
- [x] R5 — Embed iframe gains a real `sandbox` attribute (security, with the C6 scheme allow-list).
- [x] R6 — xAPI correctness: `definition.type` + `interactionType` emitted; language maps use `locale ?? 'en-US'`;
      `useXAPI` now applies `XAPIConfig.actor` (only when the statement still carries the SDK's anonymous
      placeholder) and `XAPIConfig.activityId` (only onto `urn:learning-kit:activity:*` ids) — implements the
      already-documented contract; flagged in the changeset as a behavioral fix.
- [x] R7 — `prefers-reduced-motion` guard in skin.css (cheap B11 slice).

**Docs:** README + authoring.md written-response section; design.md records the SUBMITTED IRI; changesets with
consumer migration notes (replace `written-response.ts` shim with SDK imports — Req 22.10).

### v0.4 — "scoring, assessment, rendering for exams"

**Shipped so far in the v0.4 line:**

- ✅ **Controlled components + `renderMode` + redacted rendering + rich text** (lk-react 2.1.0).
  `value`/`defaultValue`/`onChange`, `practice | exam | review`, components accept `redact()` output,
  opt-in `sanitizeHtml`. FIB `passageHtml` deliberately deferred — see the changeset for why slicing
  sanitised HTML at `{{id}}` placeholders is both lossy and unsafe.
- ✅ **Packaging: CommonJS type resolution + CI gate** (0.3.2 / 2.1.1). `exports` now nests `types` per
  format so a CJS TypeScript service can import the SDK at all; `publint` + `attw` gate every build.
- ✅ **The deferred-grading return trip**: `GradeRecord`, a `graded` arm on `ItemOutcome`,
  `gradeFromRubric()` (weighted total as a pure function of the grader's judgements — never the model's
  arithmetic), `outcomeFromGrade()`, `hasGrade()`, `XAPIVerb.SCORED`, and `<WrittenResponse>` rendering a
  returned grade with per-criterion scores and inline corrections.

- ✅ **`ActivitySequence` renderer registry + written-response dispatch** (Req 15.4–15.6 closed). A set
  mixing graded items with an essay could never complete; `onFinished` now reports a
  `SequenceItemOutcome` per slot (`scored` or `submitted`), and `renderers` puts a consumer-registered
  activity type on screen. The type system is now open in core AND in React.

- ✅ **Sectioned scoring**: `composeAssessmentScore`, per-item `points`, `RoundingPolicy` with `dp`
  required and grade-rounding kept separate from band classification, `gte()` comparing rounded values on
  both sides, and a `provisional` status so an unmarked essay never deflates a total.

- ✅ **Shared stimulus + `ItemGroup`** — the reading/listening-comprehension container, modelled as CONTENT.
  `Stimulus` (`text | audio | video | image | mixed`, kind-enforced; `transcript` author-only), `ItemGroup`
  (non-empty, unique ids, no nesting), `validateItemGroup`, `flattenSequence` (seeded, shuffle-atomic,
  authored-position `slotId`s that the server and the client both derive), `redactItemGroup` /
  `assertRedactedItemGroup`, `seededShuffle` promoted to lk-core behind a pinned-permutation drift guard,
  `<StimulusPanel>`, and `ActivitySequence` accepting groups with the stimulus mounted once and kept beside
  every question. `item-group` is reserved in the registry.

- ✅ **Adoption pass — making the v0.4 grading surface reachable.** An evidence sweep of the integrating
  application found it still pinned to `lk-core@^0.3.0`, so none of the above was callable there — while two
  defects the v0.4 work exists to prevent were live in its gradebook (a language model computing the weighted
  total of record, and an ungraded essay recorded as a hard zero). The obstacles were on OUR side, and are now
  closed: `CriterionScore.maxScore` so `gradeFromRubric` accepts a 0–100 or banded grader instead of rejecting
  it; per-type redacted TypeScript types derived from the strict schemas with `z.infer`
  (`RedactedMultipleChoiceData`, …, `RedactedActivity`, `RedactedStimulus`); a `docs/upgrading.md` leading with
  the two grade defects; and a documentation-truth pass, treated as correctness rather than housekeeping — the
  root README claimed `redact()` strips rubrics when the policy deliberately classifies them `public`, both
  READMEs denied a resume capability shipped in 2.1.0, and the published `.d.ts` told every IDE that
  `questionHtml`/`promptHtml` were "not rendered by the SDK yet" while both render.

**Remaining in v0.4, in order:**

- Scoring v2 remainder: `ItemScoringPolicy` (partial-credit configuration, optional negative marking).
  Per-item `points`, `RoundingPolicy`, `gte()` and `composeAssessmentScore()` have shipped — see above.
- **Follow-up (partly shipped):** `computePassThreshold(data, score, rounding?)` now takes an optional
  `RoundingPolicy` and compares through `gte()`, so an item shown as "70%" need not be recorded as a fail at
  69.6. Only the **default** remains open: switching it on unconditionally changes item-level pass/fail for
  every score inside the rounding band, which is a **major** under the grade-stability rule. Scheduled for
  v1.0 with the `ItemOutcome` unification.
- ✅ **`planAttempt` → `AttemptPlan`** — shipped, without the `AssessmentBlueprint` half. The evidence said the
  blueprint was the wrong half to build first: `composeAssessmentScore` already REQUIRED stable `slotId`
  identity while the only producer of one was positional, so three separately-found defects all traced back to
  the missing primitive. `planAttempt` freezes presented order, slot identity, per-slot `points` and a
  `contentHash` per item and stimulus; `verifyAttemptPlan` reports drift between a stored plan and current
  content; `scoredItemsFromPlan` feeds `composeAssessmentScore` from the plan so the denominator comes from
  the paper rather than from whatever was answered. An authored `slotKey` on an entry now overrides the
  positional path, so a stored id survives an insert. Selection/assembly (pick 20 of 60, blueprint sections)
  stays out — it is authoring, and no evidence asks for it yet.
- ✅ **Media playback policy** on `ActivityMedia` — shipped as `media.playback`
  `{ controls?, maxPlays?, seek?, rate?, nativeControlHints? }` on **audio only**, plus four
  `media-play-*` interaction kinds, an SDK-owned accessible transport, and a `planHash`-bound
  `MediaPlayLedger` the consumer persists. The sketched shape changed on evidence: `allowDownload` and
  `autoplayOnce` were **cut** rather than shipped. No client can prevent a download, so a flag reading like
  a guarantee was replaced by `nativeControlHints`, named as the advisory `controlsList` hint it actually
  is; `autoplayOnce` contradicts two shipped promises that nothing auto-plays, fails WCAG 1.4.2, and would
  consume a play unpredictably. `maxPlays` shipped, but on a roadmap hypothesis rather than replicated
  behaviour — a search of the integrating application found no play counter of any kind; what it had built
  was seek/download/rate suppression. An in-repo capability probe (`e2e/media-capability-probe.spec.ts`)
  now backs every enforcement claim, so no doc outlives its evidence. `video` and `embed` policies are
  deferred loudly, at validation. Unblocks `dictation`.
- Deferred with it: a **video** transport (it must own fullscreen and Picture-in-Picture), charging for a
  backward seek so `maxPlays` could coexist with seeking (an unpredictable budget is worse than none at an
  appeal), and `allowPause: false`.
- ✅ **`LkIntlProvider` + RTL** — shipped as the mechanism and **English only**, not as the sketched
  `en`/`es`/`pt`/`ar` bundle. Bundling three translations this repository cannot review would put unreviewed
  words in front of a learner on a summative paper, where a wrong "No plays remaining" on a listening exam
  is worse than a visibly untranslated English one; the same evidence test that cut `allowDownload` and
  `autoplayOnce` cuts them. What shipped is the whole surface — 50 strings in one `LkStrings` type, a
  provider, a per-component `strings` prop, and `mediaStrings`/`mediaBudget.strings` still winning for
  back-compat. Interpolation and plurals are **functions**, not a message format: no parser, no catalogue,
  no dependency, argument reordering possible, and TypeScript checks the arity. Thrown errors stay English
  deliberately — they address the developer, and translating them would make them unsearchable. RTL is
  real rather than claimed: the provider derives `dir` from the locale, and four physical CSS properties
  that put the per-blank feedback gap and the blank's tooltip on the wrong edge were found only because the
  new `e2e/rtl-layout.spec.ts` measures geometry in both directions. Coverage is enforced structurally —
  `src/i18n/__tests__/translation-coverage.test.tsx` overrides every string with sentinels and renders
  the real components, so a key that no component reads fails by name, and `verify-dist` pins
  `docs/i18n.md` against the BUILT dictionary so the table a consumer types their translation against
  cannot drift. **The first cut of that sweep did not earn the claim.** It mounted `exam` mode without
  submitting it and never submitted a written response at all, so it proved "no key is unreachable" but
  not "no component keeps a literal" — and three literals were sitting on exactly those paths, including
  the exam submit announcement of two components and an un-keyed sentence on the essay hand-in. It now
  drives every submitting path in every render mode, and its leak check covers the WHOLE dictionary
  including single words like "Next" (possible only because every fixture is Spanish), with sentinels
  stripped first so a key's own camelCase name cannot read as its English value. Two learner-facing bugs
  surfaced while proving it: `<FillInTheBlanks>` announced "No grade available." over a real `graded`
  outcome because `graded` shared an arm with `unscorable`, and the shared stimulus — the ordinary
  listening-paper player — was the one media host that never forwarded `strings`. Still open: no `useActivity` headless layer, no CSS-based dark mode, no full reduced-motion
  pass — those were listed beside i18n in the same v0.4 lk-react bullet and are untouched.
- ✅ **`serializeAttemptState` / `restoreAttemptState` / `diffResponses`** — plus the pager props that make
  them usable (`defaultIndex`, `onIndexChange`, `responses`, `outcomes`). A snapshot is bound to its plan by
  `planHash`, so answers can never be restored onto a paper the learner never sat, and the position and
  per-slot answers — the one part of an attempt a consumer could not previously recover — round-trip.
- **What is left of the original v0.4 lk-react line.** Controlled components and `renderMode` shipped in
  2.1.0, redacted rendering with them, the written-response dispatch in the sequence in the v0.4 line, and
  `LkIntlProvider` + RTL in 7.1.0 — English only, for the reason recorded above. **Still open, and worth
  keeping as one item:** a headless layer (`useActivity`), CSS-based dark mode with no flash on server
  rendering, and a full reduced-motion pass. The headless layer is the one with a second reason to exist:
  the web-component path in v1.0 rests on it, and hosts are already drawing their own questions — the AI
  rules reached them as hooks in 18.1.0 (`useAiHints`, `useAiExplanation`), which is the same idea one
  feature at a time.
- ✅ **Authoring slice (R8)** — `validateDraft()` with `incomplete` vs `invalid`, per-type `authoring`
  descriptors (`createDraft`, `checkDraft`), and `<ActivityPreview>` as the preview harness. The failure it
  fixes was confirmed in an integrating editor rather than taken from the roadmap line: its Save button and
  its entire preview were gated on `validateActivity`, so one freshly added question — invalid by
  construction — disabled both, and it kept a stricter validator of its own for written responses because
  nothing else could say "not finished yet". The result has **no `success` field**: a boolean would have to
  call an incomplete draft one thing or the other. It is stricter than `validateActivity` and never looser,
  which a property test holds over generated editor-shaped drafts, together with the guarantee that every
  issue for such input carries a documented `code`; each code's severity is fixed in one table that a test
  pins to `docs/authoring.md`. Three choices went against the obvious default: a new multiple-choice
  draft marks **no** option correct, since a pre-marked one lets an untouched control become the answer key;
  `minWords: 0` stays complete, because `<WrittenResponse>` already renders it as "up to N words"; and a
  blank `prompt` is incomplete even beside `promptHtml`, as a stimulus's `bodyHtml` already requires `body`.
  **An external review then found those guarantees narrower than claimed, and it was right.** The property
  test never generated an option with no `isCorrect`, a `null` optional field, an unchosen `<select>` or a
  missing `schemaVersion`, and each of those came back as a raw zod code at `invalid`: an unfinished question
  reading as a broken one. A complete draft could also still break, two ways. A `match.locale` that is not a
  language tag made scoring throw inside the preview's review marking, outside any error boundary, and a
  recording with `maxPlays` could not be previewed in `exam` at all. The fixes: `null` where the schema
  accepts none is one documented code, `null_not_allowed`, for every registered type; an unset `isCorrect`
  or media `type`, a wrong `schemaVersion` or `type`, `redacted: true` and a refused match value each have
  their own; the preview binds a recording to a budget kept in memory, and validates on the draft's content
  rather than its identity. The arbitraries now generate absent, `null` and empty values for every field,
  and a property asserts that a complete draft always scores. **A second, adversarial round then ran against
  the built packages** — about two million generated editor-shaped drafts, every preview claim rendered in
  jsdom and on the server, every changed statement in the docs — and found more, each reproduced before it
  was fixed. A whole number past `Number.MAX_SAFE_INTEGER` leaked zod's `too_big`. A registered type's own
  refinement pointing at a field holding a `null` the schema accepts was relabelled `null_not_allowed` and
  lost its message, so the rule now reads the value zod's failing check was given and names only a `null` the
  schema itself refused. A check could give a documented code another severity, or keep a misspelled one. A
  blank captions address read as wrong, and rubric weights whose sum overflows read as complete though no
  grade could be computed (`wr_rubric_weights_too_large`). The preview keyed content on JSON key order, so a
  draft read back from a JSON column reset the author's answer; it never re-checked a draft changed in place,
  kept a spent play count across a change of recording, and let a scorer that threw in `review` take down the
  page around it. Mutation-tested by hand after both rounds: 90 of 92 mutants of the draft checks are killed
  and the other 2 are equivalent, and all 32 of the preview's are killed — the three survivors that were not
  equivalent each exposed a test that could not tell the difference. A survivor of the first preview sweep
  had already exposed one divergence — a review response
  passed as `value` where `<ActivitySequence>` passes `defaultValue` — so the preview seeds in every mode. **Cut from the
  sketch:** field metadata, ordering and grouping for generating forms — no consumer evidence, and the JSON
  Schema export already describes structure — and default content beyond an empty draft, which is pedagogy.
  ✅ **Draft support for item groups closed** in 0.12.0, as `validateItemGroupDraft` /
  `createItemGroupDraft` — a separate pair rather than an `'item-group'` activity type, because
  `validateDraft('item-group', …)` throws on purpose and that guard is what lets `isItemGroup` and
  `flattenSequence` trust their own container. Items are checked by `validateDraft` for their own type and
  their issues re-pathed under `items.N.…`, so a question inside a testlet reports the codes a standalone
  one does and cannot drift from them; an unregistered item type is reported rather than thrown, the choice
  `validateItemGroup` already makes. The editor-shaped property test found two leaks before it shipped:
  an unrecognised stimulus kind returned early and left the stimulus's own media to the schema, and a
  cleared rich-text body — an empty string, not an absent field — tripped the schema's rule and not ours,
  while a `text` stimulus carrying rich text and no plain text reported the same path twice.
- ~~`@intellectif/lk-ai` (ports only)~~ — **the package is not being built** (§3.7). The ports shipped in
  `lk-core` and `lk-react`; see [Next](#next--the-delivery-policy-then-ai) for what follows them.
- **`analyzeItem` (facility, discrimination, distractor efficiency) — promoted to a milestone of its own**
  in `lk-core`, no longer a line inside the AI item. It is statistics, not AI: it reads stored responses
  and says which questions are too easy, which do not separate a strong learner from a weak one, and which
  distractors nobody picks. It pairs with the item critic below — a critic guesses at a question, these
  numbers measure it — and it needs no model, no key and no port.
- Registry v2: descriptor gains `versions`/`migrations` (`migrateActivity`, lazy on read), `semanticChecks`
  (named, for the repair loop), `plan()` seeded presentation.
- ✅ **Grade-stability vectors, and the non-functionals that had gone stale** — the consumer parity
  test-vector suite shipped as `packages/lk-core/vectors/`: 231 calls across every path that decides a grade
  (243 today — see the v0.5 line),
  frozen by executing 0.8.1 rather than written by hand, replayed against source in `pnpm test` and against the
  built CJS and ESM in `verify-dist`, on Node 22 and 24. It was chosen on a workaround, not on the roadmap line:
  an integrating application had written its own golden scoring spec whose header said nothing else asserted a
  single number, and it persists a client-computed word count that this SDK's own contract says never to trust.
  The corpus ships in the tarball with its replayer and is deliberately NOT an export — an export is a lk-core
  minor, which forces a lk-react major for test data — and a probe confirmed a lk-core patch cascades no lk-react
  bump. **The first cut left grade paths unpinned, and an external audit named four:** `scoredItemsFromPlan`'s
  missing-outcome default; the legacy per-blank `caseSensitive`/`trimWhitespace` flags; the written-response
  count, where every fixture's client `wordCount` matched its text so trusting it looked identical, together with
  inclusive word bounds; and a gate that never compared the corpus with its inputs, so a hand-deleted vector
  passed. Rather than patch four and wait for the next audit, the scoring source was mutation-tested with an
  in-process harness that rebuilds lk-core through esbuild for each mutant. Against the first corpus the
  audit's eight exact mutations all survived, and so did 73 of 260 valid operator mutations. After a case for
  every survivor that can reach a grade, all eight are killed and 37 of 260 survive, each classified: not a
  grade (feedback prose, xAPI patterns, an `isAnswered` hook lk-core never calls), equivalent, type-only, or
  reachable only by passing a float epsilon itself. `pnpm test` now fails when a case was never generated, a
  vector was deleted by hand, or a frozen call's arguments no longer match its case. Found while freezing, and
  pinned rather than changed: `gradeFromRubric` with no activity compares against a literal `0.7`; a paper
  whose graded sections all weigh 0 records a final fail; `ignorePunctuation` alone leaves the space a removed
  mark stood beside, so "hola !" does not match "hola". Of the original non-functionals line: publint/attw
  already ran in CI; the matrix now includes Node 24, the Node the Release job builds with, and the packaging
  checks run on it; the browser floor is stated (`Object.hasOwn`: Chrome/Edge 93, Firefox 92, Safari 15.4).
  ✅ **All four of that line's open items are now closed.** `scripts/api-report.mjs` freezes the public
  surface of both packages from the BUILT `.d.ts` — 398 exported symbols with their declarations — and
  `pnpm api-check` fails CI when a build and the committed report disagree; api-extractor was passed over
  because it wants a per-package config and a rollup `.d.ts` convention this monorepo does not follow, to
  answer a question the installed TypeScript answers directly. Doc comments are stripped from the report on
  purpose: a gate that fails on a reworded JSDoc is a gate people learn to ignore. `engines` is `>=22`, which
  is what CI has actually been proving since Node 20 was retired and went end-of-life. The Release job no
  longer publishes after a bare build: `pnpm release` runs `verify-release` first — build, test, lint,
  typecheck, publint, attw, verify-dist, the API surface and the size budgets — so the last gate before bytes
  go public is the same gate a PR passes. And the mutation harness is in the repository at last, as
  `scripts/mutate.mjs`: it places single-token mutations with the TypeScript AST (never a regular expression,
  so a `+` in a string is never touched), rebuilds lk-core through esbuild per mutant, and replays the
  grade-stability corpus as the oracle.

  **It earned its place immediately, and the corpus was thinner than the last audit left it.** Every hole
  below was reproduced by hand against a real build before being fixed, and every regeneration reported
  `0 changed`, so nothing that already scored moved. `allOrNothingStrategy` was never exercised RETURNING 1:
  every all-or-nothing vector scoring full marks is multiple-choice, and `scoreMultipleChoice` inlines its own
  all-or-nothing logic rather than calling the shared strategy, so `? 1 : 0` could become `? 0 : 0` — zeroing
  every fill-in-the-blanks and gap-select paper marked that way — with all 231 vectors still green.
  `gap-select`, registered in 0.10.0, had **no vector of any kind**: a type that decides grades sat outside
  the one artifact that exists to stop grades moving. `levenshteinDistance` was never called with a
  single-character string, so both of its early exits could be broken unseen. A returned grade was never
  `maxScore`-scaled by anything but 1, so the denominator guard in `earned()` was free to change. And no
  section in any compose vector carried a `title`, so the spread that carries one could be inverted and drop
  it. Twenty vectors close all five; the corpus stands at 251.

  **The survivors that remain are classified, not ignored** — 233 of 247 mutants killed on the first full
  sweep, 237 once those vectors landed, and all ten that remain triaged one at a time. `rounding.ts` keeps three that are reachable only by passing a
  value exactly one float epsilon from a threshold, and three more that the epsilon nudge makes equivalent in
  both directions. `text-match.ts` keeps three: `rowMin = value` re-assigned when it is already that value;
  the levenshtein branch taken with `maxDistance === 0`, which only accepts a distance of 0 that the exact
  stage already returned; and starting the distance matrix at row 0, where `a[-1]` is `undefined`, never
  matches, and the recurrence over an all-mismatch row reproduces the identity row exactly. None of the three
  can move a grade.

### v0.5 — "types and content acquisition"

**Shipped in the v0.5 line:** `gap-select` (0.10.0 core / 0.11.0 renderer), media on multiple-choice
options (0.10.0), `dictation` (0.13.0), `read-aloud` (0.14.0) and interactive video (0.15.0, with its
follow-ups through lk-react 16.1.0). The remaining types below wait on evidence of demand. What comes
next is the [delivery policy, then AI](#next--the-delivery-policy-then-ai).

> **Reordered 2026-08-19 from evidence in a production corpus**, not from a theoretical gap analysis. The
> earlier ordering (matching first, true/false retired as "a UI variant of MC") did not survive contact with
> real content: in a 76-container / 408-item legacy corpus, `matching` appears **zero** times, while
> true/false carries an entire reading testlet and 41% of authored stems are gap-fill sentences faked as
> multiple-choice. Frequency in real item banks beats taxonomy completeness.
>
> **`true-false` was retired again on 2026-09-22.** Multiple choice with two options already delivers
> a true/false statement, alone or in a reading testlet built as an item group. A separate type would
> duplicate a renderer, a scorer and an authoring contract without adding a capability.

- ✅ **`gap-select` (dropdown cloze) — P0, SHIPPED** across 0.10.0 and 0.11.0. The single most-faked type:
  authors write `___` gap sentences and encode them as multiple-choice because nothing better exists, which is
  41% of the corpus's authored stems. A second, independent confirmation arrived from the integrating school's
  own Moodle instance, which was already delivering the type in production.

  It is a type of its own rather than a mode of `fill-in-the-blanks`, and the reasons are the three places they
  differ: a learner picking from a list cannot mistype, so the whole `TextMatchPolicy` surface is not merely
  unused but misleading; redaction **inverts**, because the candidate answers are the key in one and the thing
  the learner must see in the other — a shared policy would have shipped an unanswerable exam; and only
  `gap-select` has distractors. Word banks were modelled from the start rather than retrofitted, since three
  gaps sharing a bank of five is what separates a comprehension item from three three-way guesses. The empty
  first entry of each selector is part of the contract, not chrome: it is how a gap is left alone and how an
  answer is taken back, so "not answered" stays distinguishable from "answered wrongly" through the scorer
  (`incorrect-omission`), `ItemOutcome`, and `validateDraft`.

  `presentation` is carried but accepts only `'dropdown'`. WCAG 2.5.7's non-drag requirement means the choice
  belongs in content rather than in a component prop — but shipping a `'drag'` value nothing renders would have
  frozen API this repository had not validated, and widening the union later is additive. **The editor-shaped
  property arbitrary paid for itself immediately**, finding three defects before the first commit, each one a
  check reported at a path the schema does not fail at, so zod's raw code stood beside ours and an unfinished
  draft read as a broken one.

  **It then shipped half-done, and that is the lesson worth keeping.** `lk-core@0.10.0` registered the type —
  validating, scoring, redacting, with full draft support — while `lk-react` had no renderer, no dispatch in
  `ActivitySequence`, and none in `ActivityPreview`. An authored item validated and scored perfectly and
  rendered "This activity type has no renderer" on a published package, and the types were not exported from
  the public barrel either, so a consumer could not even name `GapSelectData`. Nothing caught it: every gate is
  per-package, and none of them asks whether a registered type can reach a screen. 0.11.0 closes it with
  `<GapSelect>`, both dispatch branches, the sequence's seed guard extended to `shuffleChoices`, and the public
  types exported. The guard against a repeat is a test that renders a `gap-select` item through
  `<ActivitySequence>` and asserts the unsupported notice is NOT what comes back.
- ✅ **Media as multiple-choice options — SHIPPED** in 0.10.0, out of order and on consumer evidence rather
  than the queue. Picture-choice (A1/A2 vocabulary) and minimal-pair listening had no expression at all:
  `media` sat above the question, one asset per activity. `MultipleChoiceOption.media` is additive, and
  `text` stays required, because it names the option in the accessible name and the xAPI statement and is
  what a learner sees when a picture 404s.

  Only `image` and `audio` are accepted, and the refusals are functional rather than cautious: a `<label>`
  activates its control for any click inside it, so an `embed`'s iframe or a `video`'s control bar swallows
  the click that selects the option and the learner cannot choose it. The same rule decides where each
  accepted kind renders — a picture **inside** the label, where clicking it selects and its `alt` joins the
  accessible name; a recording **outside** it, so pressing play does not commit a learner to an answer before
  they have heard the others. No `playback` policy on an option, refused rather than ignored, because
  `maxPlays` binds per slot and nothing has decided whether four recordings in one question share a budget or
  hold one each.

  Stated plainly in the authoring guide rather than papered over: on a picture-choice item the `alt` is part
  of the item, and "a cat" hands a screen-reader user the answer a sighted learner has to work out. The SDK
  requires it so an option is never *silently* inaccessible and leaves the wording to the author; where an
  item cannot be made equivalent, the accommodation is a different item. **A first cut was rejected by an
  existing invariant test** — the schema was strict, and a test counting closed objects in the exported JSON
  Schema caught that strictness would start rejecting the consumer sidecars B7 exists to preserve.
- ✅ **`dictation` — P1, SHIPPED** in 0.13.0 / 13.0.0, now that the media playback policy it depended on
  exists. The behaviour was not designed from the roadmap line: it reproduces an existing dictation
  implementation, whose scoring code was executed over a 111-case corpus — every punctuation mark,
  contraction, accent form, spacing variant and length that implementation handles — and that corpus is now a
  fixture the SDK replays on every test run.
  The grade is what that implementation computes: `(length − edit distance) / length` over the whole sentence
  with case, punctuation and spacing ignored, a pass at 70%, one similarity per word for the marked display.

  **What was reproduced and what was deliberately changed are both frozen, by case id.** The fixture lock
  lists thirty-one cases the SDK grades differently, each with the change that moves it, and fails if one of them
  ever silently re-aligns with the reference: inner whitespace is collapsed (the reference charged an edit per
  extra space while its own word display showed every word at 100); every Unicode punctuation mark is ignored
  except an apostrophe or hyphen inside a word, where the reference ignored six marks and penalised Spanish
  and Portuguese for `¿` and `«`; typographic apostrophes are folded (a phone keyboard's U+2019 cost 15
  points); text is NFC-normalised, which turns five failing attempts with decomposed accents into full marks;
  characters are code points, not UTF-16 units; compatibility characters are read as what they stand for, so
  the `ﬁ` ligature a PDF carries is the two letters it draws; and the reference's hard-coded English contraction table,
  which rewrote inside words (`Roche's` → `roche is`, scoring 100 for a wrong answer), became **content** — a
  sixteen-row equivalence preset an application injects, whole-word anchored, so adding `let's` is an edit to
  an item and not a package major. A second lock re-implements the reference's own arithmetic on the SDK's
  code-unit primitive and reproduces the corpus 111/111, so the two agree on the distance and differ only in
  policy.

  **Three decisions were made on execution rather than taste.** `fastest-levenshtein`, the library the
  reference uses, was not adopted: 279,900 random pairs showed it agrees exactly with the edit distance the
  SDK already had, so it bought no correctness, and a two-row Wagner–Fischer over code points replaces it. The
  library counts UTF-16 units (an emoji is two edits), keeps a module-level table that stays corrupted after a call
  throws mid-way, and last shipped in 2022. Similarity
  is `(max − d) / max`, one correctly rounded division, because `1 − d / max` evaluates to `0.6699999999999999`
  for 33 edits in 100 and fails an authored 0.67 — 1,360 of 8,400 exact rational ties failed under the
  first form and none under the second, so the type joins the other built-ins in passing a tie. And the
  reference's `toFixed(2)` before its pass line was not copied: a raw 0.69995 is a fail by default, as
  everywhere in this SDK, and the missing `{ rounding }` option that `computePassThreshold` already took
  finally reached `score()` and `evaluate()`, so an application wanting "compare as displayed" sets it once and
  the authored feedback follows.

  **The scorer is one computation the display reads.** `alignDictation()` returns the normalised strings,
  which accepted transcript won and the word pairings; `diffDictationChars()` the character edits;
  `dictationReferenceWords()` the ids a stored result is checked against — the reference's own review screen
  re-normalised without expanding contractions and showed red marks on answers it had scored 100. Word
  pairing keeps the reference's integer rule and both of its tie orders, each pinned by a vector found by
  brute force over every short sequence. Two recordings are modelled as the reference has them — a slower
  **file**, not a `playbackRate` change — with the slow one following the recording's policy and never
  holding a budget of its own, refused beside `maxPlays` rather than left as a bypass. Captions are refused
  on a dictation recording, and a title or description containing the transcript is refused, because both
  are the answer. Learner text is bounded at 8000 code points before AND after normalisation, and at twice
  that while rules run — one rule could grow 7,999 characters into 159,999, and four could grow one typed
  letter past what a process can hold — and the character diff is a separate export precisely so the
  server-side exam scorer never runs the O(n·m) matrix it does not need.

  **What the gates found on the way in.** `tolerance` had to be one scalar answer-key leaf: a nested field
  policy over an array of all-answer-key rules projects to `[{}, {}]`, which is not empty, survives
  `reveal: 'none'`, and fails the strict redacted schema — every English item carrying the preset would have
  failed to redact. The editor-shaped property test found a schema refinement that fired on a missing URL.
  An authoring test caught a documentation example that paired a contraction rule with, as an accepted
  transcript, exactly what the rule turns the transcript into — a duplicate the schema rightly refuses.

  **What adversarial verification found after every gate had passed.** Agents executing each documented
  claim against the built packages, with skeptics trying to refute each report, found that the gates had not
  asked the right questions. In the core: rules that rewrite a word into several copies of itself, schema-valid
  and draft-complete, exhausted the process from a single typed letter, in `score()` and in `validateDraft`
  alike; a pasted passage of 33,333 characters, or a rule's `from` of 32,768, made validation throw
  "regular expression too large" instead of reporting a length; a combining mark counted as a word boundary,
  so a Hindi rule rewrote the middle of a word and the title guard refused an innocent title; control
  characters survived normalisation, so a transcript of U+0000 validated; `isAnswered` read text the scorer
  cuts; and `{ rounding: null }` threw while a policy without `dp` failed a perfect score in silence. (The
  component's own build had already found that the redacted schema accepted a hand-built projection carrying
  captions, which are the answer.) In the component:
  the per-word sentences a screen reader hears were marked with the dictation's language, so a Spanish
  interface over an English dictation was voiced with English phonetics; keyboard focus fell to the page after
  "Reset hints"; two separately hydrated copies of one item paused each other's recordings; and an
  `inline-block` on the character marks stopped the wrong word's wavy underline from being drawn, while the
  end-to-end test that should have caught it read a computed style that says "underline" whether or not
  anything is painted.

  **A second round, run against those fixes, found the first round's own guarantee false.** The working-text
  cut had been documented as never changing the first 8,000 characters of a result; a rule whose rewrite was
  mostly punctuation pushed a transcript's words past it, so a schema-valid item gave full marks for part of
  the sentence. Nor can any bounded computation reproduce unbounded rules in general: a rule that shrinks what
  an earlier rule grew needs back the text the cut removed. So a rewrite is now inserted as its words — the
  punctuation the comparison would ignore no longer takes up room — the cut is part of the normalisation
  rather than a claim about it, a transcript that needs it is refused, and an attempt that needs it is
  reported as truncated. The same round found a 60-million-character attempt exhausting a 512 MB heap, a
  thousand stale accepted transcripts taking 33 seconds to score, `validateDraft` slowing quadratically with
  its issues for every type (older than dictation), a title revealing a transcript joined to it by punctuation
  or written in Chinese or Thai, captions on a group's stimulus recording that a dictation plays, the word list
  laid out in the direction of whatever the learner typed, and a wrong character inside a wrong word differing
  from the right ones by colour alone — which a new end-to-end test now checks by comparing pixels, and fails
  when the fix is removed.

  **A third round found what the second round's rules had removed as invisible, and what its reveal check
  refused.** A Persian word written without its half-space scored 100 while the usual keyboard substitute was
  marked wrong; the flags of England and Scotland compared equal, as did two keycaps and two Mongolian letter
  forms; the Catalan middle dot and the Tibetan tsheg were removed and the Hebrew geresh and maqaf charged
  against their keyboard stand-ins. These are kept or folded now, each where it is spelling and nowhere else. A
  rule for a symbol glued its rewrite to the digit it touched, so `50%` never met `50 percent`; a rewrite is
  now set apart as a word, outside scripts written without spaces. The reveal check refused a Thai vocabulary
  item titled with the Thai word for dictation, because two of its letters spell "eye", and missed a
  transcript with a space in it; it now looks inside unspaced text only for four or more characters, and
  refuses a title too long to search. Validating a draft normalised every dictation string twice, and a group
  draft three times; a rounding policy read through an accessor was checked on one read and applied from another; hint
  words split at a byte-order mark the scorer removes. In the component, a wrong combining mark had a span of
  zero width, so no underline was painted for it; a missing digit's bullet split a number in right-to-left
  text; `ckb` and other tags the direction list did not know were laid out left to right; and `data.locale`,
  which places a dictation's words, was still documented as never touching the page. The matching was rewritten
  as a literal search with the same word boundaries, checked against the regular expression it replaced — and
  its first version read back the text it was building, which made every rewrite cost everything before it, a
  slowdown found only by timing the documentation's own performance sentence. The new end-to-end tests measure
  painted marks and the bullet's place in Chromium on the component's own markup; each case that guards a fix
  fails on the component as it was, and the rest are controls.

  **A fourth round found the third round's spelling rules too generous, and its searches slow.** Normalising a
  transcript a second time could change it: a modifier apostrophe was judged as a letter beside a joiner and only
  then folded into punctuation, and the last NFC could compose away the mark that had kept a joiner. A joiner
  was kept wherever it stood between two letters — a non-joiner between two Latin letters, or after a Persian
  letter that joins nothing after it, counted as spelling, and a Malayalam chillu or a Bengali khanda ta in its
  older spelling scored below a visibly wrong one because its joiner counted — while a joiner ending a word let a
  Persian rule for "three" rewrite the start of "Tuesday". A joiner is now kept only where the rules for joiners
  in domain names say it changes what is drawn, a kept joiner belongs to its word, and the older spellings
  compare as the forms Unicode recommends. Fullwidth letters, ligatures and Kangxi radicals looked like the text
  they stand for and hid it from the reveal check; they are read as that text now. A rule whose edge was a
  Chinese or Thai letter never fired in running text; a title with `1,100` gave away a transcript of `100`;
  and zod's handling of an optional key with any issue — it drops the key from what later checks see — ran the
  dictation checks without the rules or the recording and leaked raw issues into `validateDraft`. The reveal
  search was quadratic and repeated for every check that asked: a draft group of fifty long dictations took 97.6
  seconds, and the worst single item a second and a half. A linear search, a per-character table for the
  boundary tests and a memo a draft's checks share with its schema bring those to under two seconds and about
  half a second on the same machine. In the component, a Thai SARA AM, a Sinhala conjunct asked for
  with a joiner and a Malayalam dot reph left a wrong letter with a mark of no width, while the letters after a
  Tamil, Gurmukhi or Sinhala virama, which are drawn apart, were marked as one; the wavy underline skipped ink
  around the descenders and stacked letters it existed to mark; a missing space's bullet landed on the far side
  of a change of direction; stale data with a `locale` that was not a string crashed the component; and Firefox
  logged a hydration error for every dictation's answer box. The third round's change to `directionForLocale()`
  was withdrawn rather than repaired: it asked `Intl.Locale` for a language's script, on which a server and a
  browser can disagree, so a hydrated provider could change its `dir` — and the upgrade note had misstated which
  tags it moved. A dictation now reads its direction from its tag alone, and the provider's is what it was. Two
  findings were limits rather than faults, and are documented instead: a Hebrew geresh or a Tibetan tsheg at the
  edge of a word is removed like an apostrophe, and two dictations with one title on a page are two form
  landmarks with one name.

  **A fifth round read the fourth round's tables against Unicode's own data, and found them short.** The
  viramas a joiner may follow were 38 of the 69 characters Unicode 16 gives that class, and the joining
  letters left out Mandaic, Manichaean, Sogdian and four other scripts; both are now generated from the
  Unicode Character Database, and a joiner between a letter and the virama after it — Unicode's own way to
  ask for a Bengali ya-phalaa or a Sinhala touching conjunct — is kept too. A halfwidth katakana voicing mark
  stayed apart from its kana, so `ｶﾞﾗｽ` scored half against `ガラス` and a halfwidth title gave a transcript away
  unseen; a joiner typed twice was removed as if never typed; a Malayalam nta, a Thai SARA AM with its tone
  mark between the parts, and a Marathi eyelash ra with a spare joiner each scored below their standard
  spelling. A tag run after a flag was checked in quadratic time, so a valid title took four seconds to
  validate; a removal between two lone surrogates paired them into a new character, breaking idempotence, so
  a lone surrogate is now read as U+FFFD; a cut that ended on a space left an empty word, and counted it. The
  reveal check read a transcript with its rules applied, so a numeral rule hid `三月三日` in a title showing
  it and exposed `两本` in one that did not; it now reads the transcript as written. zod skipped every
  dictation guard once any other field failed, so an author fixed a recording's address before learning the
  title gave the answer away; the guards now run beside other refusals. In the component, Chromium painted no
  mark on a wrong letter inside a Gurmukhi, Tamil, Chakma or Brahmi conjunct, and WebKit, which shapes each
  element apart, drew correctly typed conjuncts and Mongolian words broken, so correct characters are now one
  run; turning off common ligatures for the whole diff unstacked Tai Tham, while leaving them on lets Calibri
  draw a wrong `i` into its `fi` with no mark, so they are turned off only for Latin, Greek and Cyrillic runs;
  a missing consonant's bullet swallowed the correct letter after its virama; and `lang="ar_EG"` was not a
  language a screen reader could voice. Seven findings were limits, and are documented: Persian in
  presentation forms carries no half-space to keep, the older Sorani spelling of ە, a superscript digit that
  joins its number, a space that groups digits, a missing digit of a number that follows a word of the other
  direction, grouping by syllable rather than glyph, and letters newer than a server's Unicode tables.

  Each finding of the five rounds is fixed or, where it was a limit, documented, and each fix has a test or a
  vector that pins it. A hundred and eighty-two new grade vectors, none of the ones already published changed;
  349 of 444 mutants killed, the last fifteen by vectors a sweep's survivors asked for. Every survivor is
  triaged: 26 as equivalent (a swap on equal lengths, loop-start offsets whose skipped cell already holds the
  right value, early returns that yield the text they were given, a `max === 0` branch nothing reaches
  through the public surface — one settled by executing the mutant over 200,000 pairs — an early stop that
  differs only for text the attempt cap cuts anyway, a fast path for ASCII that answers what the regular
  expression it skips would, surrogate tests that cannot differ on text with no lone surrogate in it, and the
  unused tail of a jamo table), and 69 as code only the schema, the reveal search and the validation memo
  run.

  **Out of scope, deliberately:** a shared play budget across two recordings (the question the option-media
  release left open, still open), transposition credit, a word-level scoring strategy, diacritic folding as a
  knob, and a rounded pass line by default. `speaking-response` inherits the normaliser, the alignment, the
  per-word `ScoringDetail.score` channel and the two-recording shape.
- ✅ **Interactive video — SHIPPED** in 0.15.0 / 15.0.0, on the consuming application's request: a video that
  stops at moments an author chose and asks the learner questions, then carries on. Followed by two
  caption languages at once (0.16.0 / 16.0.0) and questions a host draws itself, `renderQuestion`
  (16.1.0). **Formative only, by decision (2026-09-22):** see §5.

  It is **not a new activity type**, and that was the decision the rest followed from. It is an item group
  whose stimulus is a video and which carries a `timeline` of quizzes — so every question stays an ordinary
  activity with its own slot id, its own response and its own grade, nothing in scoring, redaction, plans or
  composition needed a new path, and an older `lk-core` that drops the unknown field still renders the same
  testlet with the same grades. A quiz holds several questions, because that is how the content is written
  (three multiple-choice at 0:50, two fill-in-the-blanks at 2:00, a read-aloud at 4:00).

  Five embeddable types — multiple choice, fill-in-the-blanks, gap select, dictation, read-aloud — named as
  data (`INTERACTIVE_VIDEO_ITEM_TYPES`) so the schema and the player cannot disagree. No provider embeds: a
  YouTube or Vimeo iframe cannot be paused from outside, and an interactive video that cannot be paused is
  not one. The player draws a quiz over the video and grows the player rather than scrolling inside it, keeps
  every opened question mounted so a rewind loses no answer, makes the chrome `inert` and suspends the
  shortcuts while a quiz is open, and holds seeking, playback and resuming at an unanswered required quiz.

  **What the milestone proved out:** the quiz engine is pure and property-tested — no quiz skipped by speed
  or by a stalled frame, no required quiz passed unanswered by seeking or resuming, no `no-skip-ahead` learner
  past what they watched — and 21 hand-written mutants of the player, the engine, the parser and the bar were
  all caught. The published-artifact checks were extended the same way the read-aloud milestone extended them:
  the new subpath is pinned in `verify-dist`, `public-surface` and `.size-limit.json` (34 kB brotli including
  all five question types), and the 48 new strings are proven to reach the DOM by the translation sweep.

  **Out of scope, deliberately:** folding the video into `<ActivitySequence>` as one step (a group with a
  timeline still pages as a testlet, which is documented), provider embeds, in-video branching, drawing or
  hotspot overlays, and an editor timeline UI — the SDK ships the model and the codes, the editor stays the
  application's.
- **`mark-the-words`, `ordering`, `short-answer` — P1/P2**, on evidence of demand.
- **`matching` — demoted to P2.** No production evidence of use; build it when an item bank asks for it.
- `speaking-response` remains high value-to-effort where a CEFR speaking grader already exists.
- `@intellectif/lk-interop`: H5P import is worth more than first estimated — a real corpus is dominated by
  `H5P.QuestionSet` containers, which map onto the item-group primitive below. Word/PDF/CSV/paste import first.

### Next — the delivery policy, then AI

Chosen 2026-09-22, ahead of any new activity type.

✅ **AI help for learners shipped first, in 0.17.0 / 17.0.0, by the maintainer's choice** (2026-09-22).
It covers explanations and hints for four types, with an author's per-item switch and no AI in
`exam`; see [docs/ai.md](./ai.md). Its switches sit on the ports a host passes and on the item. The
delivery policy that follows gives them a per-deployment home, and hint penalties with it.

✅ **Host-renderer parity in `<ActivitySequence>` shipped** in 18.1.0 (2026-09-22), ahead of
the delivery policy it was paired with. A `renderers` override is handed a `question`: `active`
(so a host's recorder is told when its question leaves the screen), `setPending` (so `onFinished`
waits for an upload of its own), `portalContainer` (a node inside its own pane, since a popover
portalled to `document.body` stayed over the next question and vanished in fullscreen), `clear`,
`emit` and its `slot` — with every call, `onSubmit` and `onComplete` included, keeping one
identity for the life of the set. **The AI half shipped with it**, as `useAiHints` and
`useAiExplanation`: the audit that closed 0.17 gave host-drawn questions the ports, but the rules
behind them — when help is offered, the hint limit, the checks, the abort — were the
components’ own, so a host had to rebuild them. The components are now built on those hooks, so
there is one implementation and a host’s question refuses what the SDK’s refuses. `ask` is
the guard rather than the button: it does nothing where the rules say no, so a page that draws its
own button reaches no model in an `exam`.

✅ **AI groundwork shipped** in 0.19.0 / 19.0.0 (2026-09-22): what a call cost, what was refused,
and a way to test a prompt. The AI line was about to grow — feedback on writing, pronunciation
coaching, assisted grading — and three things were missing under it, each cheap now and awkward
later.
- **What a call cost rides on the result.** `AiTextResult.usage` is the `GraderUsage` a returned
  grade already carries, so one shape covers help for a learner and marking by a grader, and
  `ai-hint-shown` / `ai-explanation-shown` carry it to `onInteraction` beside the provenance. Tokens,
  cost, quotas and rate limits stay the host's: it holds the key, the model, the billing and the
  learner's identity, and the SDK has none of them. What the SDK owes it is the record.
- **A refusal is reportable.** `ai-help-refused` carries the feature and the reason — never the
  text, which for `reveals-answer` is the answer. A development build warns in the console; a
  production one said nothing at all, so nobody could watch a model's leak rate where it matters.
- **A prompt can be tested.** `@intellectif/lk-core/ai-check` makes the calls a learner's questions
  would make, on items whose answers the SDK knows, and runs the same checks it runs before a learner
  sees anything: `aiCheckCases`, `runAiCheck`, `formatAiCheckReport`. A host runs it in its own CI,
  with its own key, when it changes a prompt or a model. It is a separate entry point because it is
  for a test run, not a learner's browser. Cases include the ones a model slips on: an answer a hint
  can hardly avoid naming, an answer of one short word, an accented answer, and a passage with more
  than one blank.
- **And the placeholder went.** `packages/lk-ai` had sat empty since the first week (§3.7).

1. **The delivery policy.** `renderMode` (`practice | exam | review`) is three fixed presets. Educators
   need the settings underneath, so that one activity serves a practice lesson and a final exam
   without being authored twice:
   - when correctness and feedback show;
   - whether solutions show;
   - whether a learner may retry (today only a read-aloud upload has "Try again");
   - whether hints are on, and what they cost, which is the one part of it that decides a grade and
     therefore belongs with `ItemScoringPolicy` (partial credit, negative marking) rather than beside
     it: a penalty is computed by the SDK and pinned by the grade vectors, and the policy only chooses
     which one applies.

   The three modes become named presets that reproduce today's behaviour exactly, so nothing changes
   for a host that passes no policy. The policy an attempt ran under is frozen into `planAttempt`
   beside order, identity and points, so a grade records the conditions it was earned under. Timers,
   lockdown and proctoring stay consumer-side (§5).

   **An authored hint may be allowed in an exam by policy; AI help may not.** An authored hint is the
   same for every learner and its penalty is computed, so a deployment can price it. Two learners
   sitting one paper would not get the same AI help, so the rule that shipped in 0.17.0 — nothing AI
   in `exam`, whatever is passed — stands rather than becoming a switch.
2. **The AI line, in this order.** Explanations, hints and the groundwork above have shipped; what
   is left is ordered by what a learner or an author gets from it, and each is admitted only on the
   rules below.
   1. **Feedback on writing, in practice** — the largest of the remaining four for a language
      school, and the one with a check only this SDK can run: a correction must quote text that is
      actually in the learner's answer, at the place it claims (`InlineCorrection` already carries
      the quote and its offsets), so an invented error is refused as a leaking hint is. A draft, its
      feedback and a revision are one loop, and the indicative score is `gradeFromRubric`'s, marked
      provisional.
   2. **Pronunciation coaching on a read-aloud** — the model explains the engine's marks and
      never re-scores them (`docs/speech-assessment.md` already says so, and the published
      comparisons behind it), with the matching check: a word it calls mispronounced must be one the
      engine marked.
   3. **Assistants for authors** — drafts generated from a passage, a transcript or a video's
      captions (for an interactive video, placed at caption times); a repair loop driven by the SDK's
      own `validateDraft` issues; an item critic reporting in the same shape those checks do, so an
      editor shows one list. Needs registry v2's named `semanticChecks`. Each output is a draft a
      person approves. `analyzeItem` belongs beside it.
   4. **Assisted grading of open responses**, admitted to summative use only through a calibration
      against human marks — agreement, per criterion, with no default threshold — and a
      deterministic rule for which grades go to a person.
   5. **`speaking-response`**, built on that grading.

   **Not on this list, deliberately:** a chat tutor with memory (the checks hold for a bounded
   answer, not a conversation, and it is the host's product rather than an activity's); streamed
   text, which would put a leak on the screen before the check that catches it; and generated
   questions served straight to a learner, where a wrong key teaches the mistake — only from a
   pool a person approved, which is why it waits on the authoring assistants.

   The rules every AI feature follows, beside the standing decisions:
   - **The model judges and explains; the SDK computes every number.** `gradeFromRubric` already
     works this way.
   - **Grounded in the SDK's own facts.** The context a model receives is the SDK's scoring details: the
     key, the response, the per-blank matches, the dictation alignment, the read-aloud marks. What
     comes back is validated, and a hint containing an answer is refused with the scorer's own
     matching.
   - **Labelled, and stored with its provenance.** `GradeRecord.grader` already has `model` and
     `promptHash`. An output is never regenerated on read.
   - **Off unless three things allow it:** the content, the delivery policy, and a port the host
     supplied.
   - **Never blocking.** A failed call removes the feature for that moment; the question stays
     answerable.

   Settled by what shipped in 0.17.0:
   - **learner-facing AI is off in `exam` and not overridable.** The proposal was an explicit
     override recorded in the attempt plan; a model that answers two learners differently on one
     paper of record is not something a recording makes fair;
   - **the author's per-item switch** (`ai: { hints, explanations }`) is in content, classified
     public, and survives `redact()`. The educator's per-deployment switch joins it in the delivery
     policy, and a feature appears only where both say yes and the host supplied a port.

   Still to settle in the milestone plan: calibration metrics shipped with no default threshold, as
   rounding ships no default `dp`.

### v1.0 — "schema 2.0 and the stability promise"

- `ItemOutcome` becomes the single scoring result (legacy `score()` overload removed, `ScoringDetail.correct`
  removed, `.d.ts` cleanups); `schemaVersion: '2.0'` default write / `'1.0'` readable indefinitely (lazy
  migration); codemods; published conformance suite; stated deprecation windows (schema majors readable ≥ 24
  months); zod → peer or internalized; web-component/`lk-embed` evaluation on top of the headless layer
  (the "replace H5P in non-React LMSes" path — categorical gap, honestly deferred until headless exists).
- **It also ends the version cascade, which is a reason to bring it forward.** `lk-react` peers on
  `@intellectif/lk-core@^0.x`, and a caret on a `0.` version matches only that minor — so every `lk-core`
  minor puts the range out of date and releases a `lk-react` **major**. That is why `lk-react` is at 18
  while most of those majors broke nothing, and a major that breaks nothing teaches consumers to stop
  reading them. `^1.x` matches every later minor, so from `lk-core@1.0.0` a minor is a minor. The
  grade-stability rule is unaffected: what makes a release a major there is a changed grade, not a version
  range.

---

## 5. Standing decisions

| Decision | Ruling |
| --- | --- |
| Anything that can change a historical grade | Package **major**, always. New tolerances opt-in. |
| Model clients / API keys / provider deps in `lk-*` | Never. The SDK defines ports; the application supplies adapters and owns its prompts and content. |
| License | MIT for `lk-core` / `lk-react`. |
| `react`/`react-dom` as peers; `lk-react` ships no runtime `dependencies` | Keep. Confirmed correct by an integrator — React duplication incidents trace to consumer-side nested workspaces, not to this packaging. |
| Authoring UI, storage, taxonomy, identity, delivery, timers, proctoring | Consumer-side, permanently. SDK ships contracts (`validateDraft`, descriptors, preview) only. |
| Generality without a second consumer | Rejected (no registry instances, no version negotiator, no plugin loader). Add when consumer #2 exists. |
| Interactive video in summative exams | Not a use it serves (2026-09-22). It is formative: the learner controls the recording while the questions are open, and nothing times a question or holds a single pass. Its `exam` mode is a check-in without feedback, not exam conditions. Papers of record go through `<ActivitySequence>`. Its questions still grade exactly, under the same vectors. |
