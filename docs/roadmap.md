# learning-kit — SDK Roadmap

**Status:** living document. Supersedes the "Future Work (Phase 2 and Phase 3)" section of
[`.kiro/specs/learning-kit-sdk/tasks.md`](../.kiro/specs/learning-kit-sdk/tasks.md) as the roadmap of record.
**Last updated:** 2026-08-19
**Inputs reconciled here:**

1. The original V1 spec and task list (`.kiro/specs/learning-kit-sdk/` — requirements, design, tasks). Next
   scheduled item there was **Task 25 / Req 22: Written Response** (`[Phase 2 — Next]`), followed by Phase 2/3
   candidates (drag-and-drop, true/false, interactive video, plugin architecture, lk-ai, lk-server, i18n,
   offline, weighted scoring).
2. [`docs/lk-sdk-update-requirements.md`](./lk-sdk-update-requirements.md) — an external audit written from the
   published `dist/` of `lk-core@0.2.1` / `lk-react@1.0.1` and from the only consumer (`academic-platform-ocw`).
3. A line-by-line **verification of that audit against current source** (2026-08-19, 14 independent
   verification passes). Verdicts below. Claims about consumer-side code could not be verified in this repo and
   are marked accordingly.
4. Direct consumer feedback: (a) a **written-response section graded by AI had to be built from scratch**
   outside the SDK; (b) **reading-comprehension assessment is under-served** by two activity types compared to
   Moodle; (c) the SDK powers **real mid-term and final tests**, not just formative practice — so anything that
   can change a historical grade is treated as breaking, always.

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
| "Zero call sites" table, three-renderer divergence, consumer line counts | **Unverifiable here** | Consumer repo not present. Treated as credible directional evidence, not fact. |

**Where the audit is right and it matters most:** the strip-mode/JSON-schema disagreement, the deferred-grading
gap (an ungraded written response is indistinguishable from a 0), the redaction gap, and the closed type system
are all real and all verified. **Where we deviate from the audit:** see §3.

---

## 2. What was next on the original roadmap — and what this analysis adds

**Originally next (unchanged in spirit):** Task 25 / Req 22 — promote `written-response` into the SDK. The
audit and the consumer feedback independently confirm this was the right next item; it ships in v0.3.0.

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
(re-scoped to `serializeAttemptState`/`restoreAttemptState` in v0.4), lk-server LRS proxy (unchanged, later).

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
5. **Rounding (R3.4):** deferred to v0.4 with the audit's own warning honored — no `half-up` default; the
   consumer's signed-off round-down band policy must not be silently inverted.
6. **`AttemptPolicy` enforcement, delivery, timers, persistence, identity:** stay consumer-side (agreeing with
   the audit against over-building).
7. **License/moat (§15.1):** keep MIT for `lk-core`/`lk-react`; keep every calibrated prompt, item bank, and
   graded corpus consumer-side. `lk-ai` ships **ports only** (no model client, no key, no provider dep).
   Revisit only if `lk-ai` starts carrying prompt IP.

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

- Scoring v2: `ItemScoringPolicy` (per-item points, partial-credit config, optional negative marking),
  `RoundingPolicy` (**no silent default** — see §3.5) + `gte()` epsilon helper, `composeAssessmentScore()`
  (weight normalization, per-section thresholds, `pass_failure_reason`) — mirrors consumer's
  `final-test-scoring.service.ts` so client and server share one formula.
- `AssessmentBlueprint` + `planAttempt(bp, seed, resolve)` → `AttemptPlan` with **`slotId`** identity, frozen
  `maxPoints`, `contentHash` per slot (re-grade reproducibility). Sections gain an optional **shared
  `stimulus`** (passage/media rendered once for N items) — the reading-comprehension/testlet primitive.
  Sequencing note honored: the platform ships its pin first; the SDK freezes the learned shape.
- `serializeAttemptState` / `restoreAttemptState` / `diffResponses`.
- lk-react: **controlled components** (`value`/`defaultValue`/`onChange` + `renderMode: 'practice' | 'exam' |
  'review'` — named to avoid the `MultipleChoiceData.mode` collision), redacted-data rendering (deletes the
  consumer's exam renderer + redactor), headless `useActivity` layer, `LkIntlProvider` (`en`/`es`/`pt`/`ar`) +
  RTL, CSS-based dark mode + no-flash SSR, full reduced-motion pass. `ActivitySequence` written-response
  dispatch (requires the widened results type).
- Authoring slice (R8): per-type authoring descriptors, `validateDraft()` with `incomplete` vs `invalid`,
  preview harness.
- `@intellectif/lk-ai` (ports only): `LlmBridge`, `generateActivities` + named-semantic-check repair loop +
  `AiProvenance`, `lintActivity` (item-writing critic), `gradeFreeText` + `RubricConfig` + CEFR descriptor
  data, `analyzeItem` (facility/discrimination/distractor efficiency).
- Registry v2: descriptor gains `versions`/`migrations` (`migrateActivity`, lazy on read), `semanticChecks`
  (named, for the repair loop), `plan()` seeded presentation.
- Non-functionals: publint/attw semver gate in CI; CI matrix includes the release Node version; browser-support
  statement; consumer parity test-vector suite for `countWords`/graders.

### v0.5 — "types and content acquisition"

- New types in ELT-gap order (P0): `matching`, `gap-select` (with schema-level `presentation: 'dropdown' |
  'drag'` — WCAG 2.5.7), `mark-the-words`, `speaking-response` (the highest value-to-effort item: a production
  CEFR speaking grader already exists consumer-side). Then (P1): `ordering` (adjacency-pair partial credit, not
  exact-position), `short-answer` (`matchMode: exact | contains | regex | ai-lenient`), `dictation`. (P2):
  drag-the-words presentation variant, flashcards, interactive video.
- `@intellectif/lk-interop`: H5P import (~8 mapped types) + Moodle XML import, each with a `ConversionReport`;
  **Word/PDF/CSV/paste import first** (highest real-user value). QTI: keep `correctResponsesPattern` on
  descriptors, build nothing more. SCORM/LTI: skip (delivery concern).
- xAPI completeness pass: per-item results, attempt numbers, `contextActivities.parent` wiring from components.

### v1.0 — "schema 2.0 and the stability promise"

- `ItemOutcome` becomes the single scoring result (legacy `score()` overload removed, `ScoringDetail.correct`
  removed, `.d.ts` cleanups); `schemaVersion: '2.0'` default write / `'1.0'` readable indefinitely (lazy
  migration); codemods; published conformance suite; stated deprecation windows (schema majors readable ≥ 24
  months); zod → peer or internalized; web-component/`lk-embed` evaluation on top of the headless layer
  (the "replace H5P in non-React LMSes" path — categorical gap, honestly deferred until headless exists).

---

## 5. Standing decisions

| Decision | Ruling |
| --- | --- |
| Anything that can change a historical grade | Package **major**, always. New tolerances opt-in. |
| Model clients / API keys / provider deps in `lk-*` | Never. SDK defines ports; consumer supplies adapters; calibrated prompts and corpora stay consumer-side. |
| License | MIT for core/react (adoption); moat lives in consumer assets. |
| Authoring UI, storage, taxonomy, identity, delivery, timers, proctoring | Consumer-side, permanently. SDK ships contracts (`validateDraft`, descriptors, preview) only. |
| Generality without a second consumer | Rejected (no registry instances, no version negotiator, no plugin loader). Add when consumer #2 exists. |
