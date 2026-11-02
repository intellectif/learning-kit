# lk SDK - `@intellectif/lk-practice`: skill-aware adaptive practice

**Type:** requirement design task, for implementation in the `intellectif/learning-kit` repository. It proposes a **new package**; it does not change `lk-core`, `lk-react` or `lk-azure`.
**Status:** proposed, ready to build. Nothing is implemented. Revised on 2026-11-01 after decisions on the four open questions of the first review (short-term scheduling, the `lk-core` relationship, generated practice from day one, and the ability model for hosts with a placement test) and on three architectural shifts: memory belongs to the **skill**, not the item; the planner returns **practice targets** that the host's AI turns into tasks; and evidence can grade **each component skill** of a task separately. Every design question is decided (see [Decisions (ADR-style)](#decisions-adr-style)); a decision marked **Default, changeable** is a sensible starting value that can change without reworking the design, and a decision marked **Revised** replaces the first draft's. A second pass on the same date applied a design review: configuration as plain data (D26), ability per stage with stage-relative difficulty (D27), stage demand across ladders (D28), spaced promotion successes, an opt-in slow-answer ceiling, richer generation facts, mastery-loss events and planner cost.
**Date:** 2026-11-01.
**Baseline:** `@intellectif/lk-core@1.8.0`, `@intellectif/lk-react@23.4.0`, `@intellectif/lk-azure@2.0.0`, read from this repository's source and `packages/*/api/surface.md`. External libraries were read from the npm registry on 2026-11-01: `ts-fsrs@6.0.0` (published 2026-10-28, the current `latest`) and `ts-fsrs@5.4.2` (published 2026-09-01); `ts-fsrs@6.0.0` was also run in a spike on that date. Runtime target: **Node.js 24 LTS** for this package (decision D1).
**Packages touched:** new `packages/lk-practice`; repository wiring only elsewhere (scripts, size limits, README table, docs). No change to any existing package's public API.
**Host scenarios:** two illustrative hosts are used throughout as examples: (1) **a code-practice platform whose sandbox runs learner code** (procedural and coding skills; Appendix A), and (2) **a language-learning LMS with an existing skill map and placement test** (declarative and performance skills; Appendix B). In both, the host generates practice tasks with its own AI from what this package says needs practice.
**Companion documents:** the build design is [lk-practice-design.md](lk-practice-design.md) (architecture, full types, algorithms, determinism, testing, wiring) and the branch-by-branch plan is [lk-practice-milestones.md](lk-practice-milestones.md). They sit in `docs/`, not in `docs/internal/` as `lk-azure`'s plan did, because `docs/internal/` is ignored by `.gitignore` (D11).

**Where this file lives:** `docs/`, beside the other `lk-sdk-*-requirements.md` proposals, so `pnpm docs-check` checks it like any other document. That check (`scripts/check-doc-imports.mjs`) verifies every `import ... from '@intellectif/lk-...'` in fenced code against the committed API reports (`packages/*/api/surface.md`), and `@intellectif/lk-practice` has no report until it is built. So the examples below name the proposed package's exports in a comment instead of an `import` line; imports from `@intellectif/lk-core` are real and are checked. The public guide (`docs/practice.md`) uses real imports once the package exists (see [Docs and release](#docs-and-release) and D11).

---

## The decision in one line

Build **one new, opt-in, pure-TypeScript package** that answers a single question for any learning product - **"which skills should this learner retrieve next, in what form, at what difficulty, and when again?"** - from a host-supplied skill graph and a log of evidence. It keeps one memory per **skill at its current stage** (FSRS-7 for timing), one ability estimate per skill and stage (Elo for difficulty and readiness), and returns **practice targets**; the host's AI turns each target into a fresh task, the package checks it, the host proves it, and the learner's graded attempt flows back as evidence for every skill the task exercised. The package never calls a network, a model, a database, a clock or a random source; the host supplies all of them.

---

## Why

### The problem

Many skills are learned by doing, not by flipping cards: write the code, produce the sentence, debug the program. Practice for them works best when it is scheduled the way the evidence says it should be: **active retrieval** from long-term memory rather than re-reading, spaced rather than massed, progressing from studying an example to producing and transferring, at a difficulty where the learner succeeds most of the time but not always, and never asking for a skill whose prerequisites are not in place. When the tasks themselves are made by AI, on demand, from what needs practice, a fixed bank of cards no longer fits: a generated task is seen once, so memory has to belong to the skill, not to the task. A concrete example goal: **write a chat-model call to an LLM in Python, with its basic parameters, from memory, understanding every part of the syntax** - with the system creating new tasks around it and tracking each part separately (Appendix A). A language-learning product with a prerequisite skill map and a placement test needs the same engine for a different kind of knowledge (Appendix B). No open, typed library does this today (see below).

### Why a package, and why here

- Every package in this repository is educational, and the repository's discipline - **pure functions, ports instead of providers, frozen API reports, shipped test vectors, independent versioning** - is exactly the discipline a scheduler needs. A scheduling bug silently costs a learner weeks, so determinism and replayable vectors matter more here than almost anywhere.
- **Two distinct host scenarios** (procedural code practice; declarative/language practice) validate domain-agnosticism. `docs/roadmap.md` §5 rejects "generality without a second consumer"; here the procedural scenario drives the MVP and the declarative scenario checks that the core really is domain-agnostic.

### Why it is not "just rebuilding something that exists"

Short answer: **the pieces exist; the combination, as an open, typed, deterministic SDK, does not.** The detailed comparison is in [Landscape and differentiation](#landscape-and-differentiation). In one table:

| What | Exists, open, usable from TypeScript? | Notes |
|---|---|---|
| Card-level memory scheduling (FSRS) | **Yes** - `ts-fsrs` (MIT) | Use it; do not re-derive the maths. |
| Recall-probability models (HLR, Ebisu) | Partly (HLR as Python research code; `ebisu-js`) | Both benchmark below FSRS (see Landscape). |
| Memory scheduled **per skill**, with each task a disposable instance and several skills retrieved by one task | **No** library found | Flashcard schedulers key memory to a card; intelligent tutors key mastery to skills but do not schedule spaced retrieval openly. |
| Prerequisite-aware "ready to learn" (Knowledge Space Theory) | **No** - ALEKS is proprietary | |
| Spaced repetition that flows credit through a skill hierarchy | **No** - Math Academy's FIRe is proprietary and described only in blog posts | Closest prior art to this proposal. |
| Knowledge tracing (BKT) | Python only (`pyBKT`), and it needs data from many learners | Poor fit for one learner. |
| Mapping graded evidence from any activity (auto test, AI grade with confidence, per-criterion grades, self-rating) to per-skill scheduler ratings | **No** library found | Every app hand-rolls it. |
| A planner that emits **targets** (skills, stage, difficulty for a chosen success rate, form constraints) for an AI to turn into tasks | **No** library found | Generators exist; none is driven by a learner model through a typed contract. |
| Typed, model-agnostic grader, item-generator and goal-decomposition contracts with a proof gate | **No** library found | `lk-core` already has the pattern for assessment (`./ai-check`, `GradeRecord`, `routeGrade`). |

**The new value is the layer between the memory model and the product**: per-skill memory and ability over a host graph, task-stage progression, a planner that targets difficulty and emits generation targets, evidence-to-rating mapping down to component skills, and typed generator, grader and decomposition contracts with a proof gate - all deterministic and test-vector-driven, in the same style as `lk-core`.

---

## What exists today

### In this repository

| Area | Today | Where |
|---|---|---|
| Spaced repetition, memory state, mastery, Elo, BKT | **Nothing.** No code, no types. | searched across `packages/` |
| Item outcome | `ItemOutcome` union: `unscorable` / `scored` / `graded` (carries `GradeRecord`) / `deferred`. `evaluate(data, response, options)` returns one. | `lk-core` root export |
| Grade record | `GradeRecord { score, maxScore, passed, feedback, criteria?, details?, corrections?, evidence?, rationale?, confidence?: 'high' \| 'low' \| 'medium', requiresHumanReview?, grader?: Grader, usage?, gradedAt?, routing? }`; `Grader { kind: GraderKind, id?, model?, promptHash? }` with `GraderKind = 'ai' \| 'auto' \| 'human'` | `lk-core` root export |
| Routing a model's grade | `routeGrade(grade, { mode: 'exam' \| 'practice', item, calibration?, policy?, sampleKey? })` returns `{ to: 'model' \| 'person', reasons }`. | `lk-core` root export |
| Calibration | `calibrationReport(pairs, scope)`; the scope is written-response specific (rubric, language target). **No thresholds ship.** | `lk-core` root export |
| Tries and hints | `ItemScoringPolicy`, `scoreTries(tries, policy)`; practice answers report `hintsRevealed`. | `lk-core`, `docs/scoring.md` |
| Determinism helpers | `hashSeed(string) -> number`, `seededShuffle(items, seed, { version })`, `contentHash(value)`, `inAuditSample(key, rate, seed)`. | `lk-core` root export |
| Model ports | `./ai-check`: the SDK builds the facts a model is given and checks what comes back; **the SDK never calls a model, never holds a key, never writes a prompt** (`docs/ai.md`). Includes a variants request (`aiVariantsRequest`). | `lk-core/ai-check` |
| Schema policy | zod is **private** to `lk-core`: `verify-dist` fails on an exported zod schema or a published type that names zod. Public contracts are TS types + validation functions + JSON Schema; custom types accept any Standard Schema (`StandardSchemaV1` is exported). | `lk-core`, `scripts/verify-dist.mjs` |
| Conformance vectors | `packages/lk-core/vectors/` (`scoring.json`, `validation.json`, `variants.json`, `replay.mjs`) - language-neutral fixtures another implementation can replay. | `lk-core` |
| Provider package precedent | `lk-azure` 2.0.0: peer `lk-core`, no runtime dependencies, its own stability section. | `packages/lk-azure`, `docs/internal/lk-azure-plan.md` |

### Standing decisions this proposal must respect or explicitly revise

From `docs/roadmap.md` §5 and `docs/stability.md`:

1. **"Model clients / API keys / provider deps in lk-*: Never."** Respected: graders, generators and decomposers are ports; the host supplies them.
2. **"Authoring UI, storage, taxonomy, identity, delivery, timers, proctoring: consumer-side, permanently."** Respected: the skill graph, and every extension of it, is **input data the host supplies**; the package owns no taxonomy, no storage, no timers and no delivery.
3. **"Generality without a second consumer: rejected."** Respected: two distinct host scenarios (procedural code practice; declarative/language practice) validate the design, and the MVP still ships no registries, plugin loaders or version negotiators.
4. **"Anything that can change a historical grade: package major, always."** Extended by analogy: anything that changes a **schedule, stage, mastery result or plan for the same log** is a major (see [§11](#11--serialization-versioning-and-migration)).
5. **Revised (decision D3, accepted):** the roadmap retired "Learner Profile / Adaptive hooks (out - consumer-side)", and says decision models are "not for adaptive sequencing, which stays the host's". This package **is** adaptive sequencing. The proposal keeps that promise for `lk-core` and `lk-react` - nothing changes there - and puts adaptive sequencing in a separate, opt-in package. `docs/roadmap.md` §5 records the revision in the PR that adds the package; D3 gives the exact row.
6. **Node.js support:** `docs/stability.md` promises Node.js 22 or later, CI runs 22 and 24, every existing package declares `"engines": { "node": ">=22" }`, and requiring a newer Node is a major. **This package starts at Node.js 24** (D1). That is a **policy choice**, not a measured incompatibility: `ts-fsrs@6.0.0` declares `"engines": { "node": ">=24.0.0" }`, yet the spike ran its synchronous FSRS-7 path on Node 20 without error; the package follows the engine its dependency declares rather than rely on an undeclared path. A new package's first `engines` field breaks no one, so it is not a major for any existing package, and the existing packages keep `>=22` until their own next majors. Node 22 reaches end of life on 2027-04-30.

### In the illustrative hosts

The two scenarios assume hosts with the following, which is what the appendices map to the package:

- **A language-learning LMS with an existing skill map and placement test:** skill objectives with an id, a kind, a level band, a can-do statement and a review status; prerequisite links between objectives, **hard or soft**, kept acyclic; placement items linked to objectives; an item-response placement engine (for example a Rasch model giving a `theta`); a practice scoring policy where the first try counts (for example through `lk-core`'s `scoreTries`); and the wish that placement becomes the first value of each learner's ability per objective. A host still on Node 22 moves to Node 24 before it adopts this package (D1).
- **A code-practice platform whose sandbox runs learner code:** lessons with a few learning objectives each and exercises from easy to stretch, each with **acceptance checks that fail on the starter and pass on the solution**, and solutions beside them - which is exactly the proof the gate in §9 asks of an exercise. Under D5 the engine runs **server side, in a Node 24 TypeScript process** that owns the learner's practice state (the platform's backend if it is TypeScript, or a small practice service beside a backend in another language, for example Python); a Python port is not part of this proposal, though the shipped vectors keep one possible.

---

## Goals

- **G1 - Memory of skills, not items:** keep one memory per **skill at its current stage**, scheduled by a proven memory model (FSRS-7 by default) behind a port. Any task that exercises a skill updates that skill's memory; tasks are disposable instances.
- **G2 - Readiness:** never introduce a skill whose **hard** prerequisites are neither mastered nor credited; prefer skills whose prerequisites are all mastered (the "outer fringe" of Knowledge Space Theory).
- **G3 - Progression:** move each skill through **task stages** (recognise -> recall -> produce -> apply for declarative skills; example -> complete -> write -> transfer for procedural skills), driven by evidence across days.
- **G4 - Evidence from anything, down to the component:** turn evidence from any activity - a unit-test run, an AI grade with confidence, an `lk-core` `GradeRecord` with criteria, a self-rating - into per-skill memory and ability updates, through one documented mapping the host can override; a task's evidence may grade each component skill separately.
- **G5 - Targets, not cards:** plan a session as an ordered list of **practice targets** - skills, stage, target difficulty for a configured success rate, form constraints and a reason - within a budget, balancing due retrievals, stage-ups and new material, capping load and interleaving **confusable** skills; attach a matching proven item when one exists.
- **G6 - Contracts:** typed, model-agnostic contracts for graders, task generators and goal decomposers, so the host can plug in test sandboxes, AI graders, people and LLM generators without the package knowing which; generated tasks pass a proof gate before a learner sees them.
- **G7 - Determinism:** same inputs, same outputs, on every supported runtime; injected time and seed; shipped JSON test vectors; a replayable log.
- **G8 - Domain-agnostic core:** nothing about English, Python, CEFR bands or code in the core types; domains live in consumer data and in examples.
- **G9 - Goal-driven graphs:** a learner's own goal ("write an LLM call in Python") may extend the host's graph with a decomposition into component skills, which the package validates and reconciles; it never invents the decomposition itself.

## Non-goals (the host's job, permanently)

- Storage, sync, accounts, identity, multi-device conflict resolution. The package returns new state; the host persists it.
- Network calls of any kind: no model client, no API keys, no telemetry, no fetching items.
- Running code. Code exercises are graded by the **host's sandbox**; the package receives the result as evidence.
- Writing prompts. Like `lk-core/ai-check`, the package builds the **facts** a generator or grader receives and **checks** what comes back.
- Authoring UI, taxonomy authoring, skill-map editors. The skill graph is input.
- Timers, notifications, reminders and delivery channels (web, email, push, messaging apps). The package emits **events**; a channel is the host's.
- React components. A `lk-react` practice UI may come later as its own proposal; nothing here depends on it.
- Population analytics, dashboards, A/B testing.
- Fitting model parameters inside the package (see [§4](#4--memory-model-scheduling), R4.8).
- Writing generator, grader or decomposition prompts, choosing models, or judging content quality beyond the structural checks and the proof record in §9.

---

## Learning science, with honest evidence levels

The package encodes design defaults, not laws. Each default states how strong its evidence is, so the builder knows what must stay configurable. Rows marked "not re-read" come from the earlier fact-check or from general knowledge of the literature and were not re-reviewed for this revision.

| Claim used in the design | Evidence level | What the package does with it |
|---|---|---|
| Retrieval practice and spacing improve long-term retention compared with re-study and massed practice. | **Strong**, long-established in cognitive psychology (not re-read). | The core premise: every target asks for retrieval; nothing schedules passive review. |
| FSRS predicts recall better than older open models on large review datasets. The open `srs-benchmark` README reported a log loss of 0.3401 for FSRS-7, 0.4694 for HLR and 0.4989 for Ebisu v2 (lower is better; without same-day reviews) when read on 2026-11-01. | **Strong for flashcard-style recall** (Anki data). **Untested** for skills practised through varied, generated tasks. | FSRS-7 is the default memory model, behind a port. Applying it to a skill retrieved through many different tasks is a modelling assumption the package states, simulates and lets the host replace; it is not an established result. |
| FSRS's default **desired retention is 0.90**. | **Fact** (library default). | Default `desiredRetention: 0.9`: it decides **when** a skill is retrieved again. |
| Wilson et al. (2019), "The Eighty Five Percent Rule for optimal learning": for learners trained by gradient descent on binary classification, learning is fastest when the **training error rate** is about 15.87%, so accuracy about 85%; supported by simulations and a model of animal perceptual learning. | **Theoretical, with simulations**; not tested on human skill or language practice. | Default `targetSuccess: 0.85`: it decides **how hard** a task is (the planner's target difficulty, R6.3). It is a training error rate, **not** a retention target; it is kept distinct from `desiredRetention` and configurable in [0.6, 0.95]. |
| Practice is better tracked per **knowledge component** (a skill) than per item: learning curves are smoother and predictions better when attempts on different items are grouped by the component they exercise (Koedinger, Corbett & Perfetti, 2012, the Knowledge-Learning-Instruction framework; learning-curve work in intelligent tutors). | **Moderate to strong** in the intelligent-tutoring literature (not re-read). | Memory and ability are keyed to skills (D14); items are instances. |
| "N repetitions to learn a word or skill." Vocabulary studies give ballparks: about 10 encounters (Webb, 2007), about 12 (Nation), 5-7 spaced retrievals (Nakata). | **Weak as a rule**: it varies widely by item, learner and task. A widely repeated "30-50 productions" figure was **not** found in any source. | **No repetition count is hard-coded.** Mastery comes from evidence and the models, not from a counter. |
| Successive relearning - retrieving to a criterion in a session, then again across later sessions - gives durable retention (Rawson, Dunlosky & Sciartelli, 2013). | **Moderate to strong** for declarative material (not re-read). | Promotion and mastery count only successes **spaced by a time gap** from the previous counted one (R3.2, R3.5), never several within one sitting. |
| Interleaving helps when items are **confusable** (categories, problem types). A meta-analysis (Brunmair & Richter, 2019) found g = 0.42 overall, but **blocking was better for words/vocabulary** (about -0.39). | **Moderate**, and **conditional**. | The planner interleaves only skills in the same `interleaveGroup`; new vocabulary-like skills are introduced blocked. Configurable. |
| Attempting to answer **before** being taught (a pretest), even unsuccessfully, can improve later learning of that material (Richland, Kornell & Kao, 2009; Kornell, Hays & Bjork, 2009). | **Moderate**, mostly for text and word-pair material (not re-read). | An opt-in `pretest` target for a new skill, logged with `context: 'pretest'`, which never lowers ability or memory (R7.3). Off by default. |
| Errors made with **high confidence** are corrected more readily after feedback than low-confidence errors (the hypercorrection effect; Butterfield & Metcalfe, 2001). | **Moderate** (not re-read). | Evidence may carry the learner's `learnerConfidence`; a confident error raises an `evidence.confident-error` event so the host can give feedback, and the value is exported for the host's calibration views. No scheduling maths depends on it in the MVP. |
| Declarative (facts) and procedural (skills) knowledge benefit from different practice forms. | **A design distinction** in wide use; the underlying theory (for example Ullman's declarative/procedural model) was **not** re-verified for this document. | Skills carry `knowledge: 'declarative' \| 'procedural' \| 'mixed'`, which selects the default stage ladder. No scheduling maths depends on it. |
| Worked examples, then faded/completion problems, then independent problems, help novices with procedural skills. | **Moderate to strong** in the instructional-design literature; not re-reviewed here. | The default procedural stage ladder. Configurable. |
| Elo-style ratings work for adaptive practice at low implementation cost; reliable **item** difficulty estimates need data from about 100 learners (Pelánek, 2016). | **Moderate**. | Elo per skill and stage is the default ability model (D27). For a single learner, task difficulty comes from **author or generator priors**, relative to the task's stage; it is not learned. |
| Response time falls with practice (the power law of practice; Newell & Rosenbloom, 1981), and practised performance becomes fast and automatic (Logan, 1988, instance theory of automatization); a correct answer far slower than fluent performance suggests a skill not yet automatic. | **Moderate** for the speed-up with practice (not re-read). **Weak** for any fixed time threshold: time also includes reading, typing and the task's length. | `easy` only at or under the host's `fluentSeconds`; an opt-in, host-set `slowSeconds` maps a slow first-try pass to `hard` (R7.2). No default threshold exists for either. |
| BKT needs fitting on many learners; studies suggest roughly 50-100+ learners and sequences of 15+ attempts per skill. | **Moderate**. | BKT is a possible later adapter for hosts with population data, not the default. |
| Practising an advanced skill implicitly reviews the skills it contains, so spaced-repetition credit can flow through a skill hierarchy. | **Plausible, not validated in peer review.** Described by Math Academy (FIRe) in blog posts only. | **Opt-in, off by default**, capped, simulation-tested (Phase 3). Distinct from per-component grading, which records a real outcome for each component (R7.2). |
| LLM-generated exercises are often unusable without checks: in Sarsa et al. (ICER 2022), only **30.9%** of Codex-generated programming exercises passed their own tests. | **Moderate** (an older model, one study), but the direction is robust. | Generated tasks reach a learner only after the host proves them (R9.3). |
| AI graders agree well with people on some rubrics and badly on others; agreement must be **measured per rubric and task** before AI grades count. | **Strong as a caveat.** `lk-core` ships `calibrationReport` but deliberately ships **no thresholds**. | AI-graded evidence carries confidence; low-confidence evidence is held or down-weighted (see [§7](#7--evidence-mapping)). |

---

## Landscape and differentiation

| System | What it does well | Why it is not this package |
|---|---|---|
| **`ts-fsrs`** (open-spaced-repetition, MIT; 6.0.0, about 359k weekly downloads) | The best open memory model; FSRS-3 to FSRS-7; review logs; learning steps; deterministic fuzz; middleware (leech, cost-based retention); rescheduling. | Card-level only: no skills, prerequisites, stages, evidence mapping or session planning. **We wrap it; we do not compete with it.** |
| **Anki** (with FSRS) | A mature flashcard app with an FSRS optimiser. | An app, not an SDK; cards are independent. |
| **`femto-fsrs`** (MIT, FSRS-5, zero dependencies) | Tiny. | Minimal and little used (about 14 weekly downloads); no logs or optimiser. |
| **`ebisu-js`** | Bayesian recall probability; public domain. | Prediction only, no scheduler; benchmarked below FSRS. |
| **Duolingo HLR** (Settles & Meeder, ACL 2016; MIT Python code) | Half-life regression, `p = 2^(-delta/h)`; reported more than 45% error reduction against baselines and +12% daily engagement. | Research code in Python; behind FSRS on the open benchmark. Duolingo's later model (Birdbrain) is internal. |
| **ALEKS** (Knowledge Space Theory) | Prerequisite structure; the "outer fringe" is what a learner is ready to learn, the "inner fringe" what to review. | Proprietary; no SDK; needs an expert-built knowledge space. |
| **Knewton** (assets bought by Wiley in 2019; now Knewton Alta) | Adaptive courseware. | Proprietary courseware, not a library. |
| **Math Academy FIRe** | Spaced repetition over a hierarchical knowledge graph: implicit repetition credit flows down to component skills, failures flow up; "repetition compression". | **The closest prior art.** Proprietary; described in blog posts; its encompassing graph is hand-encoded by experts. |
| **`pyBKT`** (MIT, Python) | Standard BKT fitting. | Python; needs population data. |
| **LLM exercise generators** (many apps) | Volume and variety. | Untyped and unchecked; the evidence above says checks are mandatory. |

**What is new here, concretely:**

1. **Memory per skill, tasks as instances** - one FSRS memory per skill at its stage, updated by any task that exercises the skill, so an AI can generate a fresh task every time without resetting or inflating memory; several skills retrieved by one task each get one review.
2. **A planner that emits targets** - skills, stage, a target difficulty chosen from the learner's ability for a configured success rate, form constraints and a structured reason; the host's AI writes the task.
3. **Component-level evidence** - a task's grade can carry an outcome for each component skill (a test per syntax part, a rubric criterion per sub-skill), so one attempt updates each part separately.
4. **Skill-graph-aware readiness and progression** - prerequisites gate new skills; stages run from example to transfer; mastery rests on retrieval across days at the top stage. Open and typed, unlike ALEKS or FIRe.
5. **Typed generator, grader and decomposition contracts** - model-agnostic, Standard Schema validated, no network, with a proof gate for generated tasks and host-approved goal decompositions.
6. **Deterministic and vector-tested** - a self-contained, replayable log and the same vector discipline as `lk-core`, so a server re-check or a future Python port gives identical results.

---

## Package name and relationship to `lk-core`

### Name

**Decided: `@intellectif/lk-practice`** (D10). Alternatives: `lk-srs` (too narrow: the package does more than spacing), `lk-mastery` (names one of its models, not its purpose), `lk-adaptive` (too broad, and echoes the roadmap's retired "adaptive hooks"). The rejected names stay rejected for the reasons given.

### Relationship: independent packages, a structural `lk-core` adapter (decided, D2, Revised)

`lk-core` today contains an **item runtime** (activities, validation, scoring, grading records, routing, calibration, xAPI, AI-check ports). It is the solid **active assessment layer**; it contains nothing about learners over time. That decides the shape:

| Option | Shape | For | Against |
|---|---|---|---|
| **A' (decided)** | **No dependency of any kind on `lk-core`**, not even an optional peer. The subpath `@intellectif/lk-practice/lk-core` declares **structural types** for the few `lk-core` shapes it reads (`ItemOutcome`, `GradeRecord`, `CriterionScore`, `Grader`) and maps them to `Evidence`. An in-repository contract test, with `lk-core` as a **devDependency** (`workspace:*`), proves those structural types accept the real `lk-core` types and that the adapter maps real `evaluate` outputs. | The packages version independently: an `lk-core` major never forces an `lk-practice` release, and `lk-practice` is not part of the release cascade `check-release-plan.mjs` guards. A code-practice host may never use `lk-core` activities. Keeps the core small and domain-agnostic. | A structural type could drift from `lk-core`; the contract test catches it in CI, in this repository, before a release. |
| A | `lk-core` as an optional peer, used only by the subpath. | The adapter names real types. | An `lk-core` major would put `lk-practice` in the peer cascade (a new peer range, a release) for a subpath most hosts never import. **Replaced by A'.** |
| B | A required peer on `lk-core` (like `lk-azure`). | One mental model for the repository. | Forces `lk-core` (and its pinned zod) on hosts that only want scheduling. |
| C | Inside `lk-core` as `./practice`. | No new package. | Breaks the roadmap's promise for `lk-core`; couples release cadence, so `lk-core` majors would carry scheduling changes. **Rejected.** |

What the package **reuses from `lk-core`'s conventions**, whatever the option:

- **Schema policy:** public contracts are TypeScript types, `validate*`/`check*` functions, `StandardSchemaV1` objects and JSON Schema exports. zod, if used at all, is internal and pinned exactly; no exported type names zod. The package declares its own structurally identical `StandardSchemaV1` type (it is a published spec), so the root entry needs no `lk-core` import.
- **Determinism:** a documented, versioned seed derivation equivalent in spirit to `hashSeed`, and a `version` on every seeded algorithm, as `seededShuffle` has.
- **Vectors:** `packages/lk-practice/vectors/*.json` plus `replay.mjs`.
- **Grading semantics:** the adapter maps `GradeRecord.confidence`, `requiresHumanReview`, `grader.kind`, `routing.to` and `criteria` onto evidence (see [§7](#7--evidence-mapping)).
- **Facts, not prompts:** the generator and decomposition requests follow `lk-core/ai-check` - the package builds the facts a model receives and checks what comes back.

---

## Requirements

R-numbers are requirements. Numbers and defaults come from the [Decisions](#decisions-adr-style); every default is configuration unless a requirement says otherwise. Type shapes are **design suggestions**: names may change, the concepts and the behaviour must exist. The full type definitions, kept consistent with this section, are in [the design, "Public types"](lk-practice-design.md#5-public-types). A requirement marked **(revised)** replaces the first draft's; **(new)** did not exist in it.

### 1 § Architecture

- **R1.1** The root entry is **pure**: every exported function is deterministic in its arguments. No `Date.now()`, argument-less `new Date()`, `Math.random()`, `crypto.randomUUID()`, timers, I/O, `fetch` or module-level mutable state. **(revised)** Two tests enforce it over `dist/`: a static scan, and a **runtime trap** that loads the built entry with `Date.now`, `Math.random`, `crypto.randomUUID` and argument-less `new Date()` replaced by functions that throw, then runs every vector (D23). The trap matters because `ts-fsrs`'s root entry still uses `new Date()` in its deprecated APIs and its fuzz falls back to `Date.now()`; the trap proves the package never reaches those paths.
- **R1.2** Time is passed in. Every function that needs "now" takes `now: number` (integer epoch milliseconds, UTC), and stored state uses the same representation (D12). Evidence carries its own `at`. The core has no notion of a calendar day and carries no time-zone database; every duration in configuration is in **milliseconds or hours, never calendar days** (for example the 24-hour promotion gap). Where "due today" matters, the host passes an instant, `PlanRequest.dueBy` (for example the end of the learner's local day, computed with the host's own time-zone library, which handles daylight saving correctly), defaulting to `now`.
- **R1.3** Randomness is passed in. Every function that breaks ties takes a `seed: string`; derived seeds and keys are documented and versioned (D23).
- **R1.4** Ports:
  - `MemoryModel` - predicts recall and updates memory for one **skill at one stage** (default: an FSRS-7 adapter).
  - `MasteryModel` - estimates ability per skill and stage from evidence and gives the expected success on a task of a given difficulty (default: Elo).
  - `StagePolicy` and `EvidenceMapper` - pure, replaceable policies with documented defaults.
  - **(new, D26)** Every model and policy instance carries an `id`, a `version` and plain-data `params`; that is all the configuration hash sees of it, so the resolved configuration never holds a function.
  - `Grader`, `TaskGenerator` and `GoalDecomposer` - **contracts only** (types, request builders, result validators). The package never invokes them.
- **R1.5** State in, state out. Functions return new objects and never mutate inputs (enforced by tests with deep-frozen inputs).
- **R1.6** The core runs in browsers, Node, Deno, Bun and edge runtimes (`platform: 'neutral'`, `target: 'es2022'`, as in `lk-core`'s `tsdown.config.ts`). The declared engine is Node 24 (D1).
- **R1.7** Events, not callbacks: functions that change state return the new state, the **log entries to append**, and events. The host persists the entries and dispatches the events to its own channels.

### 2 § Domain model

```ts
// Skill graph - supplied by the host; the package validates it and never edits it.
export interface SkillGraph {
  readonly version: string; // the host's own version tag, recorded in state
  readonly skills: readonly SkillNode[];
  readonly edges: readonly SkillEdge[];
}

export interface SkillNode {
  readonly id: string;
  readonly knowledge: 'declarative' | 'procedural' | 'mixed';
  readonly stages?: readonly StageId[]; // overrides the default ladder for this skill
  readonly interleaveGroup?: string; // skills in one group are confusable, so interleave them
  readonly tags?: readonly string[]; // host data, opaque to the package (e.g. a CEFR band)
  readonly label?: string; // host text, passed to generators as a fact; never interpreted
  readonly description?: string; // host text, e.g. a can-do statement; never interpreted
  readonly criteriaHint?: string; // host text: how a grader can isolate this skill as a criterion; passed to generators, never interpreted
  readonly forms?: Readonly<Record<StageId, readonly string[]>>; // the host's task-form vocabulary per stage
  readonly masteryPrior?: number; // initial ability at the first stage, in logits on the Elo scale (default 0)
  readonly referenceDifficulty?: number; // the standard a master meets on a top-stage task, in stage-relative logits (default 0)
  readonly desiredRetention?: number; // per-skill override (R4.6)
}

export type SkillEdge =
  | {
      readonly kind: 'prerequisite';
      readonly from: string; // must be mastered or credited...
      readonly to: string; // ...before this is introduced (if hard)
      readonly strength: 'hard' | 'soft';
    }
  | {
      readonly kind: 'encompasses';
      readonly from: string; // the composite skill
      readonly to: string; // a component it exercises
      readonly weight: number; // 0 < weight <= 1
    };

export type StageId = string; // ladders are data, see §3

// Items - one disposable, practisable instance at one stage of one or more skills.
export interface PracticeItem {
  readonly id: string;
  readonly skills: readonly ItemSkill[]; // the primary skill has the largest weight
  readonly stage: StageId; // in the primary skill's ladder; each other skill has it or an equivalent stage (R2.2, R3.8)
  readonly difficulty?: number; // author or generator prior, in logits relative to the stage (default 0 = a typical task at this stage; about -2 easy, +2 hard)
  readonly expectedSeconds?: number; // for session budgets
  readonly fluentSeconds?: number; // optional: at or under this, a first-try success may map to 'easy'
  readonly slowSeconds?: number; // optional: above this, a first-try, no-hint pass maps to 'hard' (R7.2)
  readonly criteria?: readonly ItemCriterion[]; // grader criterion or test group -> component skill (R7.2)
  readonly form?: string; // one of the skill's `forms` for this stage, if the host uses them
  readonly contentHash?: string; // lets the host and the generator check detect repeats
  readonly origin: 'authored' | 'generated';
  readonly status: 'proven' | 'unproven'; // only proven items are planned or recorded (§9)
  readonly proof?: CandidateProof;
}

export interface ItemSkill {
  readonly skillId: string;
  readonly weight: number; // the weights of one item sum to 1
}

export interface ItemCriterion {
  readonly name: string; // a rubric criterion name or a test group, as the grader reports it
  readonly skillId: string; // one of the item's skills, or a component one of them encompasses
}

// Evidence - what happened, from any source.
export interface Evidence {
  readonly id: string; // idempotency key; the host's log store makes it unique (R11.6)
  readonly itemId: string;
  readonly at: number; // epoch ms, host clock
  readonly source: EvidenceSource;
  readonly context?: 'practice' | 'exam' | 'diagnostic' | 'pretest'; // default 'practice'
  readonly targetId?: string; // the plan target this attempt answered, for the host's analytics
  readonly durationMs?: number;
  readonly hintsUsed?: number;
  readonly attempts?: number; // failed tries before the one that counts
  readonly skillOutcomes?: readonly SkillOutcome[]; // per-component outcomes (R7.2)
  readonly learnerConfidence?: 'sure' | 'unsure' | 'guess'; // asked before feedback (R7.8)
  readonly confirms?: string; // id of held evidence this confirms or overrides (§7)
  readonly supplements?: string; // id of evidence for the same attempt: updates ability only (R7.2)
}

export interface SkillOutcome {
  readonly skillId: string;
  readonly score: number;
  readonly maxScore: number;
  readonly passed?: boolean; // default: score === maxScore
}

export type EvidenceSource =
  | {
      readonly kind: 'auto';
      readonly score: number;
      readonly maxScore: number;
      readonly passed: boolean;
      readonly checks?: { readonly passed: number; readonly total: number };
    }
  | {
      readonly kind: 'ai';
      readonly score: number;
      readonly maxScore: number;
      readonly passed: boolean;
      readonly confidence: 'high' | 'medium' | 'low';
      readonly requiresHumanReview?: boolean;
      readonly graderId?: string;
    }
  | {
      readonly kind: 'human';
      readonly score: number;
      readonly maxScore: number;
      readonly passed: boolean;
      readonly graderId?: string;
    }
  | { readonly kind: 'self'; readonly rating: Rating }
  | { readonly kind: 'exposure' } // seen or studied, no retrieval (e.g. a worked example)
  | { readonly kind: 'pending'; readonly reason: 'deferred' | 'routed-to-person' }; // graded later: held

export type Rating = 'again' | 'hard' | 'good' | 'easy';
```

- **R2.1** `validateGraph(graph)` returns `{ ok: true; graph: SkillGraph; warnings: Issue[] } | { ok: false; issues: Issue[] }` and rejects duplicate ids, edges to unknown skills, self-edges, **cycles** among prerequisite edges and among encompassing edges (each relation must be a DAG), encompassing weights outside (0, 1], stage ids missing from the configured ladders, `forms` keys that are not stages of the skill's ladder, and out-of-range `desiredRetention`. **(new)** It **warns** (`ENCOMPASSES_WITHOUT_PREREQUISITE`) when a composite encompasses a component that is not also, directly or transitively, a prerequisite of it, because a composite exercised before its parts is usually an authoring slip. Each issue has a stable `code` (for example `GRAPH_CYCLE`) and a path, in the style of `lk-core`'s validation issues.
- **R2.2** `validateItems(items, graph)` rejects unknown skills, skill weights that do not sum to 1 (tolerance 1e-9), duplicate ids, a `criteria` entry naming a skill that is neither an item skill nor a component one of them encompasses, and **(revised)** a stage that is not in the primary skill's ladder (`STAGE_NOT_IN_LADDER`). Each other listed skill must have the stage in its own ladder, or be a component (through `encompasses`, transitively) of a listed skill and have an **equivalent stage** for it (R3.8; `STAGE_NO_EQUIVALENT` otherwise), so a multi-skill item can never put a skill on a stage it cannot be judged at. It also rejects `fluentSeconds` not below `slowSeconds` when both are set (`ITEM_TIMING_ORDER`).
- **R2.3** The graph is an **input to each call**, not stored in state; state records only `graphVersion`. Items are **not** inputs to replay at all **(revised)**: each evidence log entry carries a `TaskSnapshot` of the fields scheduling needs (skills, stage, difficulty, criteria, fluent and slow seconds, content hash, origin), so a generated task the host discards after use never has to be stored for replay to work. When the host passes a graph with a different version, `reconcile(state, graph)` reports orphaned and new skills; it never silently deletes history.
- **R2.4** **(revised, D14)** **Memory belongs to the skill at its stage.** Each skill has at most one active memory, for its current stage; any proven item at that stage that exercises the skill is a retrieval of it, whoever wrote the item. The first draft's variant families (`variantOf`) are subsumed and removed: every task for a skill and stage is a variant. No memory is keyed to an item. The state keeps only an item's **usage** (`lastUsedAt`, `uses`), so the planner avoids showing the same instance again within `itemCooldownMs` (default 7 days) - a guard against learning the instance instead of the skill - and prunes usage older than `itemUsageRetentionMs` (default 30 days, measured from the newest log entry).
- **R2.5** Exposure evidence (a worked example, a reading) is logged and starts a skill's ladder (`skill.started`), but **does not count as a retrieval** for the memory model or as an observation for ability.
- **R2.6** **(new, D20)** Goal-driven extensions. A host may extend its graph with a `GraphExtension` (new skills and edges, typically an AI's decomposition of a learner's goal, §9). `composeGraph(base, extensions)` validates each admitted extension against the base and returns one `SkillGraph` whose version is `base.version + '+' + hash`. An extension may add skills under its own id prefix, prerequisite and encompassing edges among its skills, and edges **from** base skills **to** its skills; it may not add an edge into an existing base skill (so it cannot change the readiness or composition of skills the host authored), and the union must stay acyclic. The package validates and reconciles extensions; it never proposes one.

### 3 § Stages, readiness and the graph

- **R3.1** Stage ladders are configuration, with these defaults (D13, Default, changeable):
  - declarative: `recognise` -> `recall` -> `produce` -> `apply`;
  - procedural: `example` -> `complete` -> `write` -> `transfer`.
  For code, `example` means study a worked example and predict its output; `complete` means fill in or reorder a partial solution; `write` means solve from a specification against tests; `transfer` means debug, modify, or solve a variant in a new context. A `mixed` skill must declare its ladder in `SkillNode.stages` **(revised)**: it has one memory per stage, so its ladder cannot depend on which item arrives. A skill may override the ladder, including a one-stage ladder (for example `['use']`) for content with a single form.
- **R3.2** Promotion and demotion are a pure, configurable `StagePolicy` (D4, Default, changeable). A **success** is a retrieval rated `good` or `easy`; a **lapse** is one rated `again`; `hard` neither extends a success streak nor counts as a lapse. Defaults: **promote** after `K = 2` **spaced successes** at the current stage **(revised)**: a success counts toward the streak only if it is the streak's first or comes at least `promoteGapMs` (**24 hours**) after the previous counted success; a success inside the gap still reviews the memory but neither counts nor resets the streak. So promotion with `K` successes needs `K - 1` gaps: with `K = 3`, three successes, each at least 24 hours after the previous counted one, in line with successive relearning across sessions. While a streak has at least one counted success and fewer than `K`, the stage memory's due time is capped at the previous counted success plus the gap, so a long model interval cannot postpone a promotion that only waits for its next spaced success (the model's own due time is kept beside it); **demote** one stage after `L = 2` consecutive lapses at the current stage (never below the first stage). **(revised)** Evidence for a stage other than the skill's current one follows the **implication rule** (D15), comparing the skill's current stage with its **equivalent** of the task's stage (R3.8), so a task from another ladder is judged too: a success at or above the current stage counts as a success at the current stage; a failure at or below the current stage counts as a lapse at the current stage; a success below it or a failure above it does not move the current stage's memory or streak (it still updates ability). On promotion the old stage's memory is kept, marked `superseded`, and no longer scheduled; the new stage's memory starts at the first retrieval there, and its ability is derived from the stage below (R5.2). On demotion the lower stage's memory resumes if it exists. No value is claimed to be optimal; the simulator (R13.4) is where alternatives are compared.
- **R3.3** Readiness: a skill becomes `ready` the first time all its **hard** prerequisites are `mastered` or `credited` (R3.6), and records `unlockedAt`. **Unlocking is sticky**: if a prerequisite later loses `mastered` (a lapse, or a long break), dependent skills stay unlocked and the planner schedules remediation of the prerequisite instead (R6.5); a learner returning after a break is never re-locked out of work they had reached. Soft prerequisites only affect ordering (ready skills whose soft prerequisites are also mastered come first). A skill with no prerequisites is ready from the start. This is the Knowledge Space Theory "outer fringe", computed from the host's graph. **(revised)** Unlocking is evaluated only when `record` or a host action changes state, at that entry's `at`, because mastery can only be gained through evidence; `plan` and `status` never change state.
- **R3.4** Graph credit (FIRe-like) is **opt-in and off by default**. When a learner succeeds on a task of skill S, each skill T that S encompasses (transitively, multiplying weights) receives implicit credit that may postpone T's own reviews; when the learner fails S, the planner may schedule a review of S's prerequisites (R6.5). Credit never exceeds a configured cap per review, never marks a skill `mastered` on its own, and is logged with its source evidence id so it can be replayed or switched off retroactively. Under D6 graph credit is built in Phase 3, not in the MVP. In the MVP `encompasses` edges are validated, bound component skills in `criteria` (R2.2), and let the planner **coalesce** due components into one composite target (R6.4); none of those is implicit credit, because each component still needs its own graded outcome.
- **R3.5** **(revised, D4)** `mastered` is a pure predicate. A skill is mastered at instant `t` when **all** of these hold: (a) it has reached its ladder's **top stage**; (b) it has at least **2 spaced successes at the top stage** - counted as in R3.2, each at least **72 hours** after the previous counted one, with the same due cap while the count is short - and its most recent top-stage retrieval is not a lapse; (c) its Elo **expected success** at the top stage against its `referenceDifficulty` (default 0, on the top stage's scale), `sigmoid(theta_top - referenceDifficulty)`, is at least **0.80**; and (d) its top-stage memory's retrievability at `t` is at least `desiredRetention - masteryRetentionMargin`, with the margin **0.10** (so 0.80 at the default retention, and 0.60 if a host lowers retention to 0.70). Status is recomputed, never sticky: a mastered skill returns to `reviewing` when any condition fails. **(revised)** The state keeps a `mastered` flag per skill, the predicate's value after the last log entry that touched the skill. When an entry touches a skill, the predicate is evaluated at the entry's `at` and compared with the flag: a change emits `skill.mastered` or `skill.mastery-lost` (with the failed conditions) and updates the flag. A loss caused by decay before the entry - retrievability that fell below the floor while nothing happened - is therefore reported on that entry, which a before-and-after comparison at one instant would miss. `status` and `plan` read the live predicate at `now` and never emit events; `status` marks a skill whose flag is set but whose predicate now fails (`masteryLapsed`), so a host can show decay before any entry touches the skill. A skill that is never touched again emits no event. **(revised in M5)** A host action on a skill touches it as evidence does, and `reset-skill` keeps the flag, so resetting a mastered skill emits `skill.mastery-lost` on that entry; an entry on another skill never changes the flag. Only the unlock mastery caused is sticky (R3.3). The numbers are configuration. The first draft measured (c) against "the mean difficulty of its top-stage items"; with generated tasks that mean drifts with the planner's own targeting, so a fixed, author-set standard replaces it.
- **R3.6** **(new, D22)** Placement and credit. A host action `place` sets a skill's stage (for example from a placement test) and may mark it `credited`: a credited skill satisfies prerequisites (R3.3) without being `mastered`, is not scheduled until evidence for it arrives, and reports status `credited`. The first evidence for a credited skill starts its memory at the placed stage. Whether a placement justifies credit is the host's policy; a host may, for example, credit an objective only on direct evidence for it.
- **R3.7** **(new)** Status values, derived at `t`: `locked`, `ready` (unlocked, not started), `learning` (started, below the top stage), `reviewing` (at the top stage, not mastered), `mastered`, `credited`, `suspended` (leech or host).
- **R3.8** **(new, D28)** Stage demand and equivalence across ladders. Each stage id has a numeric **demand** that orders stages across ladders (`stageDemand` in configuration; Default, changeable: `recognise` 1, `recall` 2, `produce` 3, `apply` 4, `example` 1, `complete` 2, `write` 3, `transfer` 4). Demand must strictly increase along every ladder (`STAGE_DEMAND_ORDER`). A stage without a declared demand falls back to `1 + 3 * i / (n - 1)` for index `i` in its ladder of `n` stages (4 for a one-stage ladder), with a `STAGE_DEMAND_DEFAULTED` warning from `validateGraph`; an undeclared stage whose fallback differs between two ladders is an error (`STAGE_DEMAND_AMBIGUOUS`). The **equivalent stage** of stage `X` for skill `S` is `X` when `X` is in `S`'s ladder, else the stage of `S`'s ladder with the greatest demand at or below `demand(X)`, and none when every stage of `S` is more demanding. The implication rule (R3.2), coalescing (R6.4c), item validation (R2.2), ability updates (R5.2) and generation facts (R9.1) use it.

### 4 § Memory model (scheduling)

- **R4.1** The `MemoryModel` port **(revised: keyed to a skill and stage)**:

```ts
export interface MemoryModel<M = unknown> {
  readonly id: string; // 'fsrs-7' (default)
  readonly version: number; // a change in output is a new version, and a package major
  readonly params: JsonValue; // the instance's resolved options (FSRS-7: weights and steps); enters the config hash (D26)
  init(): M; // a memory with no reviews
  retrievability(memory: M, now: number): number; // 0..1; pure and cheap, called by plan and status (R12.4)
  review(memory: M, rating: Rating, now: number, context: ReviewContext): MemoryReview<M>;
  serialize(memory: M): unknown;
  deserialize(raw: unknown): M; // throws a typed error on bad input
}

export interface MemoryReview<M> {
  readonly memory: M;
  readonly due: number; // integer epoch ms
}

export interface ReviewContext {
  readonly desiredRetention: number;
}
```

**(revised in M5)** `ReviewContext` carries only `desiredRetention`. The first draft also passed `maximumIntervalDays`, `learningSteps` and `relearningSteps`, which the default model never read: they are the model's own options (R4.5), part of its `params` and so of the configuration hash. A custom model that needs them takes them as options.

`JsonValue` is plain JSON data (null, booleans, finite numbers, strings, arrays and objects of them; design 5.8).

- **R4.2** **Wrap `ts-fsrs`; do not reimplement FSRS** (D1). The adapter is the only module that imports it, and no exported type names a `ts-fsrs` type (the same rule as zod in `lk-core`), so the dependency can change without breaking the public API.
- **R4.3** Version: **`ts-fsrs` 6.x, pinned exactly, FSRS-7** (D1). The facts that decided it, read from the npm registry and a spike on 2026-11-01:

| | `ts-fsrs@6.0.0` | `ts-fsrs@5.4.2` |
|---|---|---|
| Published | 2026-10-28 (days old) | 2026-09-01 |
| Default model | FSRS-7 (34 weights, fractional days, memory `{ stabilityFast, stability, difficulty }`) | FSRS-6 (21 weights) |
| Node engines | **`>=24.0.0`** declared (the spike's synchronous FSRS-7 path also ran on Node 20) | `>=20` |
| Dependencies | `@open-spaced-repetition/srs-kit@1.0.0`, pinned exactly by `ts-fsrs` (BSD-3-Clause; its README says it is meant only as a `ts-fsrs` dependency and is under active development) | none |
| API | `defineScheduler({ model, chrono }).use(middleware).create({ config })` (synchronous); `DefaultScheduler()` (asynchronous); the old `fsrs()` remains but is deprecated | `fsrs(params)`, `createEmptyCard`, `repeat`/`next` |
| Leech | a middleware with `DEFAULT_LEECH_THRESHOLD = 0` (off) | - |
| Size (spike, esbuild, minified, neutral) | 41.5 kB, 13.6 kB gzip, for the FSRS-7 path the adapter uses | - |
| Migration | FSRS-7 needs the **full review history**; `stabilityFast` must not be invented | - |

  Decided (D1, revised):
  - Depend on `ts-fsrs` **6.x, pinned exactly** (`"ts-fsrs": "6.0.0"` today; at build time, the newest 6.x stable patch that is older than the repository's `minimumReleaseAge`, which is 30 hours and does not block 6.0.0 or `srs-kit` 1.0.0).
  - Import the model from the explicit subpath `ts-fsrs/models/fsrs-7` and build the scheduler with the **synchronous** `defineScheduler({ model, chrono }).use(...).create({ config })`, with only the middleware the package needs (desired retention, learning steps, maximum interval and, **(revised in M3)**, monotonic interval, without which the output differs from the preset; design 8.4); not the asynchronous `DefaultScheduler()` (every package function is synchronous) and not the deprecated `fsrs()`.
  - Model id: **`fsrs-7`** only in the MVP **(revised)**. The first draft's opt-in `fsrs-6` id is cut: no host scenario has FSRS-6 weights, and it would double the vectors for no user. A later model is a new id and a replay of the log (R11.5), never a conversion of stored memory.
  - `engines: { "node": ">=24" }` for this package, as policy (see "Standing decisions" item 6); the CI wiring is in R13.5.
  - Rejected: `ts-fsrs@5.4.2` on Node 22 (starts one model generation behind and forces a model switch, and a major, within months), and an own FSRS implementation (owning maths a maintained, MIT, widely used library already owns).
- **R4.4** Fuzz is **off** in the adapter (`enableFuzz: false`). The memory model stays a pure function of (memory, rating, time); fuzz in `ts-fsrs` also falls back to `Date.now()` without a seed, which R1.1 forbids.
- **R4.5** **(revised, D1)** Short-term behaviour is `ts-fsrs` 6.0.0's FSRS-7 preset, **pinned in the package's own defaults** rather than read from the library at runtime, so a library upgrade cannot change it silently: `enableShortTerm: true`, `allowModelOverride: true`, `fractionalDays: true`, learning steps `['1m', '10m']`, relearning steps `['10m']`, `maximumInterval: 36500` days, and no forced same-session re-check beyond what the model schedules. With `allowModelOverride` on, the model may replace a learning step with its own short interval; the spike measured, for a new memory, `again` 1 minute, `hard` about 14.3 hours, `good` about 4.78 days, `easy` about 53.9 days, a lapse on a review memory coming back in about 16 hours, and three `good` ratings in a row giving about 4.78 days, 26 days and 92 days. These numbers become the first `memory.json` vectors. Because a lapse may come back within the same session (1 minute), the planner is re-run after each record (R6.9), which is how a failed skill reappears in a sitting without a separate rule.
- **R4.6** `desiredRetention` defaults to **0.9** (the FSRS default). Per-stage or per-skill overrides are allowed (for example lower for `recognise`), validated to [0.7, 0.97]. The bounds are a safety rail, not a recommendation. It is a different quantity from the planner's `targetSuccess` (R6.3): retention decides **when** to retrieve; target success decides **how hard** the task is.
- **R4.7** **(revised, D24)** Leeches are counted **by the package**, not by `ts-fsrs`'s leech middleware (which is off by default and would key to a card): a skill's stage memory that reaches **8 lapses** (configuration; Anki's default leech threshold) suspends the skill with `suspended: 'leech'` and a `skill.leech` event; the host decides what to do (re-teach, or **decompose** the skill into components, §9). A host clears the suspension with an `unsuspend` host action in the log, never by editing state.
- **R4.8** Parameter optimisation is **optional and host-side**. The package does not fit FSRS weights. It exports `exportReviewHistory(entries, graph, learnerId)`, which replays the log and returns, per skill and stage, the ordered reviews with rating and timestamp, and accepts `weights` in configuration. Fitting runs in the host (for example with `@open-spaced-repetition/binding`, which needs Node 24, or the Python optimiser) once the learner has enough history; the minimum is to be taken from the optimiser's own documentation, not invented here. Whether weights fitted on flashcards transfer to skill memories is unknown; the export makes it measurable. **(revised in M5)** Not built in M5 and not yet assigned to a milestone (design 13). **(revised in M6)** Assigned to M8 (design 13).
- **R4.9** New weights produce a new config hash; `replay` recomputes state under them (R5.3).
- **R4.9a** **(new)** Retrievability is computed with the library's pure FSRS-7 forgetting curve, `curve(weights, elapsedDays, state)` from `ts-fsrs/models/fsrs-7` (verified in the 6.0.0 package: exported, no clock, no validation of the weights, so the adapter validates them once with the library's `checkFSRS7Parameters` **(revised in M3)** when the model is created, design 8.4). The stored memory is plain numbers (`stabilityFast`, `stability`, `difficulty` and the scheduler's state fields) plus the last review instant, so the planner reads it without deserialising. No FSRS maths is reimplemented.
- **R4.10** **(new)** Cost-based retention (`ts-fsrs`'s `costAdr` middleware) is not in the MVP; it may arrive later as an opt-in option, a minor, once the simulator shows its effect on skill memories.

### 5 § Mastery model

- **R5.1** The `MasteryModel` port:

```ts
export interface MasteryModel<S = unknown> {
  readonly id: string; // 'elo', later perhaps 'elo-hierarchical' or 'bkt'
  readonly version: number;
  readonly params: JsonValue; // e.g. Elo alpha and beta; enters the config hash (D26)
  init(skill: SkillNode): S; // the ability at the skill's first stage
  update(state: S, observation: MasteryObservation): S;
  prior(state: S, theta: number, pseudoCount: number): S; // a host 'prior' action at one stage (R5.5)
  derive(from: S, shift: number): S; // the ability at another stage: value minus shift, fresh uncertainty (D27)
  expectedSuccess(state: S, difficulty: number): number; // 0..1
  estimate(state: S): MasteryEstimate;
  serialize(state: S): unknown;
  deserialize(raw: unknown): S;
}

export interface MasteryObservation {
  readonly correct: number; // 0..1, partial credit allowed
  readonly weight: number; // 0..1, from the evidence mapping
  readonly difficulty: number; // the task's prior, relative to its stage, on this model's scale
  readonly stage: StageId; // the stage whose ability this updates: the skill's equivalent of the task's stage (R3.8)
  readonly context: 'practice' | 'exam' | 'diagnostic' | 'pretest';
}

export interface MasteryEstimate {
  readonly model: string; // e.g. 'elo@1'
  readonly value: number; // theta for Elo
  readonly uncertainty?: number; // K(n) for Elo
  readonly evidenceCount: number;
}
```

- **R5.2** Default: **Elo** per skill and stage, on a **logit scale** (D4, D27). Expected success `p = 1 / (1 + exp(-(theta - d)))`, where `theta` is the learner's ability on the skill at the task's stage (the skill's equivalent stage, R3.8) and `d` the task's `difficulty` relative to that stage (default 0, a typical task there). Update `theta <- theta + K(n) * weight * (correct - p)` with the uncertainty function `K(n) = alpha / (1 + beta * n)`, `alpha = 1`, `beta = 0.05`, `n` the skill's evidence count plus any prior pseudo-count (Pelánek, 2016, reports `a = 1, b = 0.05` fitted for the geography system of Papoušek et al., 2014; a later fit on the same system found `b = 0.06`, and both note that nearby values perform almost the same; the values are recorded in the vectors). Because one learner cannot calibrate task difficulty, difficulty is **read from the task and never updated** **(revised)**: the first draft's opt-in `learnItemDifficulty` is cut from the MVP, because generated tasks are seen once and there is nothing to learn a difficulty from. **(revised, D27)** The model keeps one `theta` per (skill, stage). The first stage starts at `masteryPrior` (default 0). A stage's ability, when first needed (evidence, a plan target, the mastery predicate), is derived from the nearest stage of the skill that has one: `theta - stageOffset * (demand(new) - demand(from))`, with `n = 0` so the first observations there move it fast; `stageOffset` defaults to **1 logit per demand step** (a placeholder, Default, changeable; the simulator compares 0, 0.5 and 1). A derived ability is stored only once evidence or a `prior` updates it. `MasteryEstimate.value` is `theta`; `uncertainty` is `K(n)`.
- **R5.3** **The log is the source of truth.** `replay(entries, graph, learnerId)` rebuilds the state exactly; `record` must equal "append to the log, then replay incrementally". A test replays every vector from scratch and compares with the incremental result.
- **R5.4** BKT, and a hierarchical ability model (an overall ability plus a per-skill offset, which a host with a placement test may want), are possible later `MasteryModel`s; not in the MVP (D25).
- **R5.5** **(new, D22)** A `prior` host action sets a skill's `theta` at one stage (its current stage unless the action names one) and a pseudo-count, so a placement result (for example a Rasch theta from a placement test, mapped per skill by the host) starts the skill's ability with an appropriately small `K`. A prior never changes memory or stage.

### 6 § Session planner

```ts
export interface PlanRequest {
  readonly now: number;
  readonly dueBy?: number; // include retrievals due up to this instant; defaults to `now` (R1.2)
  readonly seed: string;
  readonly budget: { readonly maxTargets?: number; readonly maxSeconds?: number };
  readonly limits?: {
    readonly maxNewSkills?: number;
    readonly maxReviewBacklog?: number;
    readonly maxRemediation?: number;
    readonly maxSkillsPerTarget?: number;
  };
  readonly focusSkills?: readonly string[]; // a host-chosen goal, e.g. a lesson's objectives
  readonly excludeSkills?: readonly string[]; // skills the host cannot practise now
  readonly excludeItems?: readonly string[]; // item ids the host cannot show now
  readonly pool?: readonly PracticeItem[]; // proven items the planner may attach to targets
}

export interface SessionPlan {
  readonly targets: readonly PracticeTarget[];
  readonly deferred: { readonly reviewsDue: number; readonly newReady: number };
  readonly budgetUsed: { readonly targets: number; readonly seconds: number };
  readonly algorithm: { readonly id: 'planner'; readonly version: number };
}

export interface PracticeTarget {
  readonly id: string; // deterministic (D23)
  readonly kind: 'review' | 'new' | 'stage-up' | 'remediation' | 'pretest';
  readonly skillIds: readonly string[]; // the primary skill first, then coalesced components
  readonly stage: StageId;
  readonly targetDifficulty: number; // logits: Elo expected success equals targetSuccess here
  readonly difficultyTolerance: number; // a generated task should land within this of the target
  readonly expectedSeconds: number;
  readonly constraints: TaskConstraints;
  readonly item?: { readonly itemId: string; readonly difficulty: number; readonly expectedSuccess: number };
  readonly reason: PlanReason; // structured codes and ids, never prose
}

export interface TaskConstraints {
  readonly forms?: readonly string[]; // the skill's `forms` for this stage, if any
  readonly needsSkillOutcomes: boolean; // true when several skills must each be graded
  readonly avoidItemIds: readonly string[]; // recently used instances
  readonly avoidContentHashes: readonly string[];
  readonly context: 'practice' | 'pretest';
}
```

- **R6.1** **(revised, D17)** `plan(state, graph, request)` is pure and returns an ordered list of **practice targets** within budget. A target says what to practise (skills, stage), how hard (target difficulty), within which form constraints, and why. When the request's `pool` holds a proven item that matches (R6.7), the target carries it; otherwise the host generates a task for the target (§9). Time per target uses the matched item's `expectedSeconds`, else a per-stage default in configuration.
- **R6.2** Default priority order (configurable): overdue retrievals (due at or before `now`) by lowest retrievability; then remediation (R6.5); then retrievals due by `dueBy`, by due time; then `stage-up` targets (the first retrieval at a newly promoted or placed stage); then **new** skills from `ready` skills at their first stage - focus skills and their not-yet-started prerequisites first, prerequisites before the skills that need them, then skills whose soft prerequisites are mastered, then the rest - capped by `maxNewSkills`. Suspended and excluded skills are never planned. A skill appears in at most one target per plan.
- **R6.3** **(new, D17)** **Difficulty targeting.** Each target's `targetDifficulty` is the difficulty at which the learner's Elo expected success on the primary skill **at the target's stage** equals `targetSuccess`: `d* = theta_stage - ln(p* / (1 - p*))`, on that stage's relative scale (R5.2), so a stage-up target is set from the new stage's derived ability. Default `targetSuccess` **0.85**, validated to [0.6, 0.95], from Wilson et al.'s 85% rule read correctly - an error rate during training of about 15%, not a retention target (see the evidence table). `difficultyTolerance` defaults to 0.5 logits.
- **R6.4** **(revised)** Ordering and coalescing. (a) Skills in one `interleaveGroup` that are all past their first stage are placed next to each other, alternating, so the learner must tell them apart; (b) a new skill's first target is not placed next to a new target of a skill in the same `interleaveGroup` (introduce confusable skills apart, then interleave them), and a new declarative skill is introduced blocked, in line with the interleaving evidence; (c) **coalescing** (default on): when a composite skill's target is planned and some of the components it encompasses are themselves due and their **equivalent stage** of the target's stage (R3.8) is their current stage - which covers components on another ladder - they join that target (up to `maxSkillsPerTarget`, default 4) with `needsSkillOutcomes: true`, so one realistic task retrieves each of them and the grader reports an outcome per component. A component that then receives no outcome gets no memory update (R7.2), never the composite's.
- **R6.5** Remediation: after a lapse on a skill whose hard prerequisite's retrievability is below its mastery floor (R3.5 (d)), within `remediationWindowMs` (default 24 hours), the planner adds a `remediation` target for that prerequisite at its current stage, at most `maxRemediation` (default 3) per plan.
- **R6.6** Ties are broken by a seeded, versioned key (D23), so the same request gives the same plan.
- **R6.7** **(new)** Item matching: a pool item matches a target when it is proven, its stage equals the target's (its other skills validated per R2.2), its skills include every target skill, its difficulty is within the tolerance of `targetDifficulty`, it is not excluded, and it was not used within `itemCooldownMs`, and, when the target needs per-skill outcomes, its `criteria` bind every target skill. Among matches the planner takes the smallest difficulty gap, then the fewest uses, then the oldest use, then the seeded key.
- **R6.8** Load caps (Default, changeable): `maxNewSkills` 2, `maxReviewBacklog` 100, `maxRemediation` 3. When due retrievals exceed `maxReviewBacklog`, the plan contains **no new skills** and says so in `deferred` and in the targets' reasons. This protects a learner returning after a break. The first draft's `maxNewItems` is gone: a new skill is one target per plan.
- **R6.9** **(new)** Just-in-time planning: `plan` is cheap and has no memory of earlier plans, so a host re-plans after each `record`. A skill failed a minute ago (R4.5) is then due again and reappears; a skill just retrieved is not repeated. The returned list is a preview for budgeting; the next target is always `targets[0]` of the latest plan.
- **R6.10** `PlanReason` is structured data (a code plus ids and numbers such as retrievability and expected success), so hosts can localise and display it.
- **R6.11** **(new)** Pretesting (opt-in, `pretestNewSkills: false` by default): a new skill's `new` target may be preceded by a `pretest` target at a configured later stage of its ladder, with `context: 'pretest'`; its evidence never lowers ability or memory (R7.3).

**(revised in M6)** Built in M6 as design 8.6 describes; the requirements above are unchanged. Where they leave a choice open, M6 made it and the design records it ("As built in M6"): the focus closure of R6.2 follows hard prerequisites only; a soft prerequisite counts as mastered in R6.2 when it is mastered or credited; a pool item that is invalid, unproven or carries a proof kind outside `acceptProofs` is not matched under R6.7 and `plan` still succeeds; and with the default `retentionMargin` a prerequisite below its R6.5 floor is usually overdue already, so it is planned as a review and remediation targets are rare (design 13).

### 7 § Evidence mapping

- **R7.1** **(revised)** `mapEvidence(evidence, task, skillStates, config)` returns `{ held: boolean; perSkill: readonly SkillEffect[] }`, where each `SkillEffect` is `{ skillId; rating: Rating | null; correct: number; weight: number; memory: 'review' | 'none'; reason }`. A `null` rating or `memory: 'none'` means "do not update this skill's memory" (exposure, a supplement, an implication-neutral stage, a skill below the weight floor). The mapping of one source outcome to a rating is the table in R7.2; which skills receive it is R7.4.
- **R7.2** The default mapping (D7, Default, changeable); every threshold is configuration:

| Evidence | Rating | `correct` | `weight` |
|---|---|---|---|
| `auto`, not passed | `again` | score / maxScore | 1 |
| `auto`, passed after hints or failed attempts | `hard` | score / maxScore | 1 |
| `auto`, passed first try, no hints | `good` | 1 | 1 |
| `auto`, passed first try, no hints, `durationMs` at or under the task's `fluentSeconds` (only when the host sets it) | `easy` | 1 | 1 |
| `auto`, passed first try, no hints, `durationMs` above the task's `slowSeconds` (only when the host sets it) **(new)** | `hard` | 1 | 1 |
| `auto` with `checks` (for example unit tests) | as above, with "passed" = `checks.passed / checks.total` at or above a configured fraction (default 1) | the fraction | 1 |
| `ai`, confidence `high` | as `auto` | score / maxScore | 1 |
| `ai`, confidence `medium` | as `auto`, but never `easy` | score / maxScore | 0.5 |
| `ai`, confidence `low`, or `requiresHumanReview` | **held**: logged, no memory or ability update until evidence with `confirms` set to its id arrives (`human`, `self` or another `auto`/`ai` grade), or a `discard-held` host action | - | 0 |
| `human` | as `auto` | score / maxScore | 1 |
| `self` | the learner's rating | again 0, hard 0.6, good 1, easy 1 | 0.5 (self-ratings are noisier) |
| `exposure` | `null` | - | 0 |
| `pending` (an outcome still being graded, for example a `deferred` `lk-core` outcome) | **held**, as above | - | 0 |
| a **skill outcome** (R7.4) | as the evidence's source kind, applied to the outcome's own score, `maxScore` and `passed`, with the evidence's attempts, hints and duration | the outcome's score / maxScore | as the source kind |

  **One attempt, one retrieval per skill.** Evidence with `supplements` set (for example an AI code review of the same submission a test run already graded) updates **ability only**, at its own weight, and never the memory schedule, so one attempt cannot count as two reviews of any skill. The `easy` rating comes only from `fluentSeconds` when the host sets it, or from a self-rating; nothing else infers fluency. Likewise a slow first-try pass becomes `hard` only through the host's `slowSeconds` (opt-in, no default, because duration includes reading and typing); without `durationMs` neither applies, and the slow row affects only the memory rating, never `correct` or ability.

- **R7.3** **(revised)** Context (D8): `exam` evidence updates **ability** at full weight. For the **memory schedule** it is asymmetric: a failed exam answer counts as a lapse (subject to the implication rule), which brings the skill's retrieval forward; a passed exam answer does not move the schedule, because exam answers are massed, crammed for and timed by the exam calendar, not the learner's memory. A host may opt in to full exam scheduling (`examsMoveSchedule: true`). `diagnostic` evidence (a placement probe) updates **ability only**, at `diagnosticWeight` (default 1), and never memory or stage (c10). `pretest` evidence (R6.11) updates nothing but the log and item usage at the default `pretestWeight` 0.
- **R7.4** **(new, D16 and D19)** Which skills an attempt updates. For each skill of the task, in order:
  1. if the evidence has a `skillOutcomes` entry for it, that outcome is mapped (R7.2 last row) and the skill's memory takes one review from it;
  2. else, if the task asked for per-skill outcomes (a coalesced target, or an item with `criteria` covering the skill) and none came, the skill is **not assessed**: no update, a `skill.not-assessed` event;
  3. else the overall outcome is mapped, ability is updated at the evidence weight times the skill's item weight, and memory takes one review only if the skill's item weight is at least `memoryWeightFloor` (default 0.3), so a skill that is a minor part of a task is not treated as retrieved.
  A `skillOutcomes` entry may also name a **component** of a task skill (through `encompasses`, or through the item's `criteria`); it then updates that component in the same way. Each memory update obeys the implication rule (R3.2) against that skill's own current stage. Outcomes naming any other skill are rejected (`SKILL_NOT_IN_TASK`), and the whole evidence is rejected with nothing logged.
- **R7.5** Idempotency: recording an `Evidence.id` that is already in the snapshot's recent-id window (the last 256 ids by default) is a no-op that returns an `evidence.duplicate` event. **(revised)** Full idempotency is the host log store's unique key on the evidence id (R11.6), because the snapshot does not hold every id ever recorded.
- **R7.6** **(revised, D21)** Out-of-order evidence (an `at` earlier than the newest log entry) is never dropped: `record` returns the entry to append and `replay-required` with the instant to replay from, and the host replays from a checkpoint before that instant (R11.7). Log order is `(at, seq)`.
- **R7.7** **(revised, D2 and D19)** The `./lk-core` adapter: `evidenceFromOutcome(outcome, task, meta)` maps `scored` to `auto`; `graded` to `ai`, `human` or `auto` by `grade.grader?.kind` (absent means `auto`), carrying `confidence` (absent on an `ai` grade means `medium`) and `requiresHumanReview`; maps a grade with `routing.to === 'person'` to a `pending` source with reason `routed-to-person` and `deferred` to reason `deferred` (both held); returns `null` for `unscorable`; and maps `grade.criteria` (`CriterionScore` entries) to `skillOutcomes` through the task's `criteria` (name to skill id), skipping entries that are `notApplicable` or lack a numeric `score` and `maxScore`, and summing entries that map to the same skill. Its input types are structural copies of the `lk-core` shapes it reads; a contract test against the real `lk-core` keeps them honest (D2).
- **R7.8** **(new)** `learnerConfidence` is logged and exported; a failed retrieval marked `sure` raises an `evidence.confident-error` event (the hypercorrection hook). It changes no rating or weight in the MVP.
- **R7.9** **(new, c8)** Held evidence never expires on its own. A confirmation applies the confirming evidence's outcome **at the held evidence's original `at`**, with the held entry's task snapshot, through replay; `status` lists pending held evidence with its age, so the host can chase or discard it.

### 8 § Grader contract (types only; the host implements)

- **R8.1** The package defines the **request** a grader receives and validates the **result**; it never calls a grader.

```ts
export interface GradeRequest<Response = unknown> {
  readonly itemId: string;
  readonly stage: StageId;
  readonly skillIds: readonly string[];
  readonly criteria?: readonly ItemCriterion[]; // grade each of these separately, when present
  readonly response: Response; // e.g. code, an answer, a transcript
  readonly reference?: unknown; // e.g. a reference solution or answer key, host-defined
  readonly rubric?: readonly RubricCriterion[];
}

export interface RubricCriterion {
  readonly name: string;
  readonly maxScore: number;
  readonly description: string;
}

export interface GradeResult {
  readonly score: number;
  readonly maxScore: number;
  readonly passed: boolean;
  readonly confidence?: 'high' | 'medium' | 'low';
  readonly requiresHumanReview?: boolean;
  readonly checks?: { readonly passed: number; readonly total: number };
  readonly criteria?: readonly { readonly name: string; readonly score: number; readonly maxScore: number }[];
  readonly feedback?: string;
  readonly grader: {
    readonly kind: 'auto' | 'ai' | 'human';
    readonly id?: string;
    readonly model?: string;
    readonly promptHash?: string;
  };
}

// Implemented by the host (a test sandbox, a model, a person's queue).
export type Grader<Response = unknown> = (request: GradeRequest<Response>) => Promise<GradeResult>;
```

- **R8.2** `gradeResultSchema` is exported as a `StandardSchemaV1` and as JSON Schema; `checkGradeResult(value: unknown)` returns typed issues (finite numbers, score within [0, maxScore], `checks.passed <= checks.total`, unique criterion names, and so on).
- **R8.3** `evidenceFromGrade(result, task, meta)` builds `Evidence` from a valid result, mapping `criteria` to `skillOutcomes` through the task's `criteria`.
- **R8.4** Consumer-side implementations, for illustration only: a sandbox running `pytest` returns `kind: 'auto'` with `checks`, and one criterion per test group that the item's `criteria` bind to component skills; an LLM code reviewer returns `kind: 'ai'` with a confidence; a host's written-response graders that already produce an `lk-core` `GradeRecord` (nothing about them is assumed beyond the `GradeRecord` they return) are `ai` evidence producers through the `./lk-core` adapter and keep using `lk-core`'s `routeGrade` and `calibrationReport`. None of these is part of the package.

### 9 § Task-generator and decomposition contracts (types only; no network)

- **R9.1** **(revised, D18)** `generationRequest(target, context, options)` builds the **facts** a generator receives for one practice target: the target id, kind and stage; for each target skill, its id, role (primary or component), knowledge type and ladder, **(revised)** its own equivalent stage of the target's stage (R3.8) with that stage's `forms`, its `referenceDifficulty`, the expected success the target difficulty implies for it, its `criteriaHint` (host text on how a grader can isolate it), `label`, `description` and `tags`; the target difficulty and tolerance on the Elo scale, with the expected success it implies; the expected seconds; the allowed forms; whether per-skill criteria are needed; the item ids and content hashes to avoid; the learner's recent lapses and weakest components among the target skills (ids and numbers only); the count wanted; and a seed. It writes **no prompt**, mirroring `lk-core`'s `aiVariantsRequest`. Turning these facts into a prompt, and calling a model, is the host's.
- **R9.2** `checkCandidates(request, candidates: unknown)` returns `{ accepted: CandidateItem[]; rejected: { index: number; issues: Issue[] }[] }`. It validates shape, the stage, skill ids (target skills and their components only), weights, `criteria` bindings (and, when the request needs per-skill outcomes, that every target skill is bound by a criterion, `CANDIDATE_CRITERIA_MISSING`, so per-component grading is possible before a learner sees the task), a declared difficulty within the request's tolerance, a declared `form` among the request's forms when it lists any, unique ids, and rejects near-duplicates by `contentHash` (against the request's avoid list and within the batch). Every accepted candidate is `origin: 'generated', status: 'unproven'`.
- **R9.3** **Proof gate:** an `unproven` item is never planned and never recorded (`ITEM_UNPROVEN`). The host promotes it with `admitCandidate(candidate, proof)`, where `proof` records what the host checked: `executable` - the reference solution passed the item's checks and at least one known-wrong solution failed them (a code-practice host's convention that acceptance checks fail on the starter and pass on the solution is exactly this); `reviewed` - a person approved it; or, only where configuration allows it (`acceptProofs`, default `['executable', 'reviewed']`), `model-checked` - an independent model check agreed, which a host may enable for low-stakes declarative tasks and which is recorded on the item so reports can tell such items apart. This requirement exists because of the generation failure rates in the evidence table. **(revised)** It is part of the MVP, because hosts generate tasks from day one.
- **R9.4** The package never stores task content beyond ids, hashes and the task snapshot fields of R2.3; content lives with the host.
- **R9.5** **(new, D20)** Goal decomposition. `decompositionRequest(goal, graph, options)` builds the facts a decomposer receives: the learner's goal (host text and an id), the anchor skills it starts from and their neighbours within two edges (ids, labels, ladders), the id prefix new skills must use, the allowed knowledge types and ladders, the maximum number of new skills (default 12), and a seed; no prompt. `checkDecomposition(request, graph, candidate: unknown)` returns a `GraphExtension` with `status: 'proposed'` or typed issues (the R2.6 rules, plus "every new skill reaches an anchor" and the size limit). `admitExtension(extension, approval, options)` marks it `admitted`, recording who approved it (`author`, `human`, or `learner` when the goal is the learner's own and `allowLearner` is true, the default for self-directed goals), and returns `{ ok: true; extension } | { ok: false; issues }`. `composeGraph` (R2.6) accepts only admitted extensions.

### 10 § Public API and events

- **R10.1** Root entry `@intellectif/lk-practice` (sketch; full signatures in the design):

```ts
// Construction: binds and validates configuration; holds no mutable state.
export function createPractice(config?: PracticeConfig): Practice;

export interface Practice {
  readonly config: ResolvedPracticeConfig;
  readonly configHash: string;
  initState(learnerId: string, graph: SkillGraph): PracticeState;
  record(state: PracticeState, input: RecordInput): RecordResult;
  act(state: PracticeState, graph: SkillGraph, input: HostActionInput): RecordResult;
  plan(state: PracticeState, graph: SkillGraph, request: PlanRequest): SessionPlan;
  status(state: PracticeState, graph: SkillGraph, now: number): LearnerSummary;
  replay(entries: readonly ReviewLogEntry[], graph: SkillGraph, learnerId: string): ReplayResult;
  replayFrom(checkpoint: PracticeState, entries: readonly ReviewLogEntry[], graph: SkillGraph): ReplayResult;
  reconcile(state: PracticeState, graph: SkillGraph): ReconcileReport;
  exportReviewHistory(entries: readonly ReviewLogEntry[], graph: SkillGraph, learnerId: string): ReviewHistoryExport;
}

export interface RecordInput {
  readonly graph: SkillGraph;
  readonly evidence: Evidence;
  readonly item?: PracticeItem; // required unless the evidence only confirms held evidence
}

export type RecordResult =
  | { readonly kind: 'applied'; readonly state: PracticeState; readonly appended: readonly ReviewLogEntry[]; readonly events: readonly PracticeEvent[] }
  | { readonly kind: 'replay-required'; readonly appended: readonly ReviewLogEntry[]; readonly replayFrom: number }
  | { readonly kind: 'duplicate'; readonly events: readonly PracticeEvent[] }
  | { readonly kind: 'rejected'; readonly issues: readonly Issue[] }; // nothing to append

// Standalone pure functions.
export function validateGraph(graph: unknown): GraphValidation;
export function validateItems(items: unknown, graph: SkillGraph): ItemsValidation;
export function composeGraph(base: SkillGraph, extensions: readonly GraphExtension[]): GraphComposition;
export function mapEvidence(evidence: Evidence, task: TaskSnapshot, skills: SkillStatesView, config: ResolvedPracticeConfig): MappedEvidence;
export function migrateState(raw: unknown): MigrationResult;

// Default models.
export function fsrsMemoryModel(options?: FsrsOptions): MemoryModel;
export function eloMasteryModel(options?: EloOptions): MasteryModel;

// Contracts.
export function checkGradeResult(value: unknown): CheckResult<GradeResult>;
export function evidenceFromGrade(result: GradeResult, task: PracticeItem, meta: EvidenceMeta): Evidence;
export function generationRequest(target: PracticeTarget, context: GenerationContext, options: GenerationOptions): GenerationRequest;
export function checkCandidates(request: GenerationRequest, candidates: unknown): CandidateCheck;
export function admitCandidate(candidate: CandidateItem, proof: CandidateProof, config?: ResolvedPracticeConfig): AdmitResult;
export function decompositionRequest(goal: LearnerGoal, graph: SkillGraph, options: DecompositionOptions): DecompositionRequest;
export function checkDecomposition(request: DecompositionRequest, graph: SkillGraph, candidate: unknown): DecompositionCheck;
export function admitExtension(extension: GraphExtension, approval: ExtensionApproval, options?: { readonly allowLearner?: boolean }): ExtensionAdmission;

// Schemas: Standard Schema objects and JSON Schema; no exported type names zod.
export const practiceStateSchema: StandardSchemaV1<unknown, PracticeState>;
export const reviewLogEntrySchema: StandardSchemaV1<unknown, ReviewLogEntry>;
export const evidenceSchema: StandardSchemaV1<unknown, Evidence>;
export const gradeResultSchema: StandardSchemaV1<unknown, GradeResult>;
export const practiceStateJsonSchema: JsonSchemaObject;
export const reviewLogEntryJsonSchema: JsonSchemaObject;
```

- **R10.2** Subpaths: `./lk-core` (the adapter, R7.7) and `./testing` (a deterministic simulated learner and vector helpers, R13.4). Nothing else in the MVP.
- **R10.3** Every export has written-out types (the repository's `api-report` cannot freeze inferred types) and TSDoc.
- **R10.4** **(revised)** Events are a discriminated union, each with `at` and the relevant ids: `review.recorded` (one per skill memory updated), `evidence.held`, `evidence.confirmed`, `evidence.discarded`, `evidence.duplicate`, `evidence.confident-error`, `skill.not-assessed`, `skill.started`, `stage.promoted`, `stage.demoted`, `skill.unlocked`, `skill.mastered`, `skill.mastery-lost`, `skill.leech`, `skill.suspended`, `skill.unsuspended`, `skill.prior-set`, `skill.placed`, `credit.applied` (Phase 3), `state.migrated`. A host maps them to whatever it owns - UI messages, email, push, a messaging app. The package has no notion of a channel.
- **R10.5** **(new, c17)** Rejections log nothing. Evidence for an item whose id differs from `input.item.id`, whose skills or stage are unknown to the graph (`SKILL_UNKNOWN`, `STAGE_UNKNOWN`), or which is unproven (`ITEM_UNPROVEN`), or evidence without an item when it confirms nothing (`ITEM_UNKNOWN`), returns `rejected` with typed issues and no entry to append. **(revised in M5)** Also: a confirmation or `discard-held` naming no held evidence (`HELD_UNKNOWN`), a confirmation that does not fit the evidence it confirms (`CONFIRMATION_INVALID`), a state built with another configuration or graph version (`STATE_CONFIG_MISMATCH`, `GRAPH_VERSION_MISMATCH`), and malformed input (`SHAPE_INVALID`). `replay` and `replayFrom` add `LOG_SEQ_INVALID` (the entries' `seq` values have a gap) and `migrateState` adds `SCHEMA_VERSION_UNSUPPORTED`.
- **R10.6** **(new)** Host actions, recorded in the log like evidence (`act`): `prior` (R5.5), `place` (R3.6), `suspend`, `unsuspend` (R4.7), `discard-held` (R7.2) and `reset-skill` (restart a skill's memories, streaks and ability, for example after the host rewrote what the skill means). **(revised in M5)** `reset-skill` keeps the skill's `unlockedAt` (unlocking is sticky, R3.3) and its `mastered` flag (R3.5).

### 11 § Serialization, versioning and migration

- **R11.1** `PracticeState` and `ReviewLogEntry` are plain JSON: no `Date`, `Map`, `undefined` values, `NaN` or `Infinity`. Both carry a schema version.
- **R11.2** `migrateState(raw)` upgrades any earlier `schemaVersion` and returns `{ ok: true; state; migrated: boolean } | { ok: false; issues }`. Migrations are pure, tested against fixtures of every past version, and never drop log entries.
- **R11.3** **(revised)** Each log entry records the config hash in effect. **(revised, D26)** The hash is taken over the **resolved configuration, which is plain data only**: every option filled in, plus `{ id, version, params }` for the memory model, mastery model, stage policy and evidence mapper, the planner version and the pinned `ts-fsrs` version (D23). No function is ever hashed; a custom policy changes the hash through its id, version or params and must bump its version when its behaviour changes. A later replay can therefore either reproduce history or deliberately recompute it.
- **R11.4** Stability promises, for a new `lk-practice` section of `docs/stability.md` (the `lk-azure` precedent): for the same log, graph and configuration, `replay` gives the same state and `plan` the same plan within a major. A change to any default that alters a schedule, an ability value, a stage transition or a plan is a **major**. A new opt-in option is a minor.
- **R11.5** A model switch (for example a later FSRS model) is a new model id; `replay` with the new model rebuilds memory from the full log. FSRS-7 requires the full history, and the log has it.
- **R11.6** **(new, D21)** The state is a **snapshot**, the log is separate. `PracticeState` holds per-skill state, item usage, pending held evidence, a recent-id window and a log header `{ length, lastAt, hash }`; it does **not** hold the log. `record` and `act` return the entries to append; the host appends them to its own store, which must reject a second entry with the same evidence id (a unique key), and saves the snapshot. The rolling `log.hash` lets the host detect a snapshot that does not match its log.
- **R11.7** **(new, D21)** `replayFrom(checkpoint, entries, graph)` continues from a stored snapshot with the entries after it; with `replay` it is how the host handles `replay-required` (choose the newest stored snapshot whose `log.lastAt` is earlier than `replayFrom`, or replay from the start). Replay sorts entries by `(at, seq)`.

### 12 § Determinism and performance

- **R12.1** Shipped vectors in `packages/lk-practice/vectors/`: `graph.json` (validation and composition cases), `memory.json` (rating sequences to memory and due times), `evidence.json` (the mapping table including the `slowSeconds` row, and the R7.4 skill selection), `stage.json` (spaced promotion and the due cap, demotion, the implication rule and cross-ladder equivalence), `plan.json` (state plus request to targets, including post-promotion targeting and cross-ladder coalescing), `log.json` (log to state, including held, out-of-order, host-action and decay-then-mastery-lost cases; **revised in M5**: named `log.json`, not `replay.json`, so it is not confused with the `replay.mjs` runner), `contracts.json` (generation, candidate and decomposition checks), and `replay.mjs`, mirroring `lk-core`'s vectors.
- **R12.2** **(revised, D23)** Floats: `Math.exp` and `Math.pow` are not guaranteed to round identically on every engine. Discrete outputs - ratings, stages, statuses, events, target order and ids, issue codes - must match exactly. Floats (stability, difficulty, theta, retrievability) are compared with a relative tolerance of 1e-9; `due` is an integer epoch millisecond (the library's `Date` value; rounded half up if it is ever fractional), compared exactly on the reference engine (Node 24) and within 1,000 ms elsewhere. On one engine, `replay` and `record` agree exactly. The config hash is FNV-1a 64-bit over canonical JSON.
- **R12.3** Property tests (fast-check, `numRuns` at least 100, as elsewhere in the repository, with the property in the test title): `replay` equals incremental `record`; `replayFrom` any checkpoint equals `replay`; `plan` never exceeds budget or caps; no locked or suspended skill and no `unproven` item is ever planned; a skill appears at most once per plan; target difficulty gives expected success equal to `targetSuccess` (within 1e-9); inputs are never mutated; the same seed gives the same plan.
- **R12.4** Performance targets, proposed and to be confirmed on the first build: `record` under 1 ms on a state with 2,000 skills; `plan` under 50 ms for 2,000 skills and a pool of 10,000 items; `replay` of 100,000 log entries under 2 s, on Node 24 on a typical laptop. A benchmark script tracks them outside the CI gates. **(new)** To meet the `plan` target without a cache (R1.1 forbids module state), `plan` evaluates retrievability only where a tier needs it - memories due by `dueBy` and hard prerequisites in a remediation window - selects them by the stored integer `due`, skips skills with no memory, and reads stored numbers without deserialising (R4.9a); one FSRS-7 curve evaluation measured about 0.36 µs on the build box (Node 20, 10^6 calls in about 0.36 s). If the benchmark still misses, the fallback is in the design (8.6).
- **R12.5** Bundle size: `size-limit` entries for the root and each subpath, set after the first build with headroom, as for the other packages. The spike measured `ts-fsrs`'s FSRS-7 path at 13.6 kB gzip, so the root budget starts around 25 kB gzip and is fixed at the first build.

### 13 § Packaging, testing and repository wiring

- **R13.1** `packages/lk-practice/package.json`: `"type": "module"`, `"sideEffects": false`, MIT, `"engines": { "node": ">=24" }` (D1), exports `.`, `./lk-core`, `./testing` and `./package.json`, each with ESM `.js`/`.d.ts` and CJS `.cjs`/`.d.cts` built by **tsdown** with the same settings as `lk-core`. Runtime dependencies pinned exactly (`"ts-fsrs": "6.0.0"` or the newest 6.x patch at build time, R4.3). **(revised, D2)** No peer dependencies; `@intellectif/lk-core` is a **devDependency** (`workspace:*`) used only by the contract test. `"private": true` until the release milestone (D9).
- **R13.2** Code style as the rest of the repository: TypeScript strict with `exactOptionalPropertyTypes`, `.js` import extensions, Biome (single quotes, 2 spaces, width 100).
- **R13.3** **(revised)** Gates: `publint`, `attw` (with the repository's `--ignore-rules no-resolution`), the package's own `scripts/verify-dist.mjs` (new work, modelled on `lk-core`'s and `lk-azure`'s: required exports, ESM and CJS export equality, no exported type naming `ts-fsrs` or zod, no `@intellectif/lk-core` import anywhere in `dist/`, and the runtime purity trap of R1.1), `api-report`/`api-check` with `packages/lk-practice/api/surface.md`, `size-limit`, coverage at the repository's 80% gate and **100% for the evidence mapping, stage policy, mastery predicate and planner selection** (the scheduling equivalent of scoring), and mutation testing on those modules, which needs `scripts/mutate.mjs` generalised beyond `lk-core` (new work).
- **R13.4** `./testing` exports a deterministic **simulated learner** (per-skill forgetting with seeded noise, a true ability per skill, and task outcomes drawn from it) that drives `plan` and `record` over simulated weeks. It is used to compare policies (for example target success 0.80 and 0.85, coalescing on and off, a stage ability offset of 0, 0.5 and 1, graph credit on and off) and in property tests. It is a test tool, not a claim about real learners.
- **R13.5** Repository wiring, following the `lk-azure` precedent: `pnpm-workspace.yaml` already covers `packages/*`; add the package to `PACKAGES` in `scripts/api-report.mjs` and `scripts/check-doc-imports.mjs`, to `.size-limit.json`, and (at release) to the README package table, `CONTRIBUTING.md`, `docs/releasing.md`, `docs/stability.md` (a new section) and `docs/roadmap.md` (the §5 revision in "Standing decisions" item 5 above). **(revised, D2)** It is **not** added to the `lk-core` peer-dependent list in `scripts/check-release-plan.mjs`, because it has no peer on `lk-core`. CI (D1): the Node 24 leg runs `pnpm verify-release`, which covers the package; the Node 22 leg's command gains `--filter=!@intellectif/lk-practice`, so it keeps proving the existing packages on Node 22 without running a package that does not support it. Whether `pnpm install` on the Node 22 leg warns about the package's engine is unverified; the scaffold milestone checks it. The package README and its `docs/stability.md` section say "Node.js 24 or later". The e2e workflow is unaffected. The exact file list is in [the design, "Repository wiring"](lk-practice-design.md#11-repository-wiring).

---

## API summary

| Export | Entry | Kind | Purpose |
|---|---|---|---|
| `createPractice`, `Practice`, `PracticeConfig`, `ResolvedPracticeConfig`, `PolicyRef`, `JsonValue` | `.` | function / type | Bind configuration; `record`, `act`, `plan`, `status`, `replay`, `replayFrom`, `reconcile`, `exportReviewHistory`. |
| `SkillGraph`, `SkillNode`, `SkillEdge`, `PracticeItem`, `ItemSkill`, `ItemCriterion`, `TaskSnapshot` | `.` | type | The domain model. |
| `Evidence`, `EvidenceSource`, `SkillOutcome`, `Rating`, `HostAction`, `HostActionInput` | `.` | type | What the host records. |
| `PracticeState`, `SkillState`, `StageMemory`, `ReviewLogEntry`, `RecordInput`, `RecordResult`, `ReplayResult` | `.` | type | State, log and results. |
| `PlanRequest`, `SessionPlan`, `PracticeTarget`, `TaskConstraints`, `PlanReason`, `LearnerSummary` | `.` | type | Planning and status. |
| `validateGraph`, `validateItems`, `composeGraph`, `mapEvidence`, `migrateState` | `.` | function | Pure helpers. |
| `MemoryModel`, `MasteryModel`, `fsrsMemoryModel`, `eloMasteryModel` | `.` | type / function | Ports and default models. |
| `Grader`, `GradeRequest`, `GradeResult`, `checkGradeResult`, `evidenceFromGrade`, `gradeResultSchema` | `.` | type / function / value | The grader contract. |
| `TaskGenerator`, `GenerationRequest`, `CandidateItem`, `CandidateProof`, `generationRequest`, `checkCandidates`, `admitCandidate` | `.` | type / function | The generator contract and its proof gate. |
| `GoalDecomposer`, `LearnerGoal`, `GraphExtension`, `decompositionRequest`, `checkDecomposition`, `admitExtension` | `.` | type / function | The goal-decomposition contract. |
| `practiceStateSchema`, `reviewLogEntrySchema`, `evidenceSchema`, `practiceStateJsonSchema`, `reviewLogEntryJsonSchema` | `.` | value | Standard Schema and JSON Schema. |
| `PracticeEvent`, `Issue` | `.` | type | The event union and validation issues. |
| `evidenceFromOutcome`, `skillOutcomesFromCriteria` | `./lk-core` | function | `lk-core` `ItemOutcome` and `CriterionScore` to `Evidence`, through structural types. |
| `simulateLearner`, vector helpers | `./testing` | function | Simulation and conformance. |

---

## Acceptance criteria

**MVP, `0.1.0`**

1. `validateGraph` and `composeGraph` reject every invalid case in `vectors/graph.json` with the expected issue codes and accept every valid one, including the extension rules of R2.6 and the stage-demand rules of R3.8. `configHash` is equal for equal configuration data, changes with a custom policy's id, version or params, and its input never contains a function.
2. With the default configuration, a new learner on a three-skill hard chain (A, then B, then C) gets a first plan whose only targets are for A at its first stage; B becomes `ready` only once A is `mastered` or `credited`.
3. For each rating sequence in `vectors/memory.json`, memory and due times match the pinned `ts-fsrs` 6.x output for `fsrs-7` with the pinned short-term configuration (R4.5) within the R12.2 rules; the spike's intervals are among the vectors.
4. Every row of the R7.2 table, every branch of R7.4 (outcome, not assessed, weight floor, component outcome, `SKILL_NOT_IN_TASK`) and every case of the implication rule (R3.2), including cross-ladder equivalence, spaced promotion (two successes in one sitting count once; the due cap; `K = 3`), top-stage spacing and the `slowSeconds` row, is a vector, and passes.
5. Two different items for the same skill and stage update **one** memory; a task for three skills with per-skill outcomes gives three `review.recorded` events and no more.
6. `plan` never exceeds `maxTargets`, `maxSeconds`, `maxNewSkills` or `maxRemediation`; above `maxReviewBacklog` it contains no new skills and says why; no skill appears twice.
7. Every target's `targetDifficulty` gives an Elo expected success equal to `targetSuccess` (within 1e-9); after a promotion the target difficulty comes from the new stage's derived ability; an attached item is proven, within tolerance and outside its cooldown.
8. Coalescing: a due composite with three due components gives one target with all four skills and `needsSkillOutcomes: true`; a due component on another ladder joins only when its equivalent stage is its current stage; a component without an outcome gets `skill.not-assessed` and no update.
9. Interleaving: confusable skills past their first stage are placed next to each other; new confusable skills are not.
10. Held AI evidence is applied at its original instant when confirmed, never when discarded; out-of-order evidence returns `replay-required`; `replay`, `replayFrom` from any checkpoint, and successive `record` calls give deep-equal states for all vectors and property runs; a mastered skill whose memory decayed below the floor emits `skill.mastery-lost` on the next entry that touches it.
11. Proof gate: an `unproven` item is never planned and never recorded (property test); `checkCandidates` and `admitCandidate` pass `vectors/contracts.json`, including a starter-fails, solution-passes proof and the per-skill generation facts of R9.1.
12. `checkDecomposition` and `admitExtension` accept the Appendix A decomposition and reject an extension that adds an edge into a base skill or a cycle.
13. No input is mutated (deep-frozen inputs in tests).
14. The built root entry contains no clock, random source, network call or `@intellectif/lk-core` import (static scan), and every vector passes with the runtime purity trap installed (R1.1).
15. `publint`, `attw`, `api-check`, `size-limit`, coverage and mutation gates pass; CI is green: the package on Node 24, and the Node 22 leg still green for the existing packages with this package filtered out (R13.5).

**Beta, `0.x`**

16. `evidenceFromOutcome` maps every `ItemOutcome` variant and `CriterionScore` case as R7.7 says, with vectors, and the contract test against the real `lk-core` passes.
17. `prior` and `place` host actions reproduce the Appendix B placement flow, with vectors.
18. The language-learning example in Appendix B type-checks against the built package.

**1.0**

19. API frozen in `api/surface.md`; `docs/stability.md` has the `lk-practice` section; `migrateState` has fixtures for every schema version a released `0.x` could persist.
20. The package has run in real use for a dogfooding period - at least **60 days** in a host of the procedural (code-practice) scenario and **30 days** in a host of the declarative (language-practice) scenario (D9, Default, changeable) - with no state migration failures and no replay mismatch.

---

## Tests

- **Unit:** graph validation and composition (each issue code); stage transitions and the implication rule; the evidence table and skill selection; Elo updates against hand-computed values; the FSRS adapter against vectors; the planner's tiers, difficulty targeting, item matching, coalescing, caps and ordering; contracts; host actions; migrations.
- **Property** (fast-check, `numRuns` >= 100): the R12.3 invariants; random DAGs never yield plans with locked skills; random logs replay deterministically, in any arrival order once sorted; random JSON never crashes `migrateState` or the `check*` functions (they return issues).
- **Vectors:** `vectors/*.json` replayed by `replay.mjs` in CI, so a future Python port can use the same files.
- **Purity:** the static `dist/` scan and the runtime trap (R1.1).
- **Simulation:** simulated learners over 90 simulated days compare the default policy with target success 0.80, coalescing off, stage ability offsets 0 and 0.5, and (Phase 3) graph credit on; results are reported, not asserted as learning claims.
- **Contract:** the `./lk-core` adapter's structural types accept the real `lk-core` types (a type test) and map real `evaluate` outputs (a runtime test), with `lk-core` as a devDependency.
- **Types:** public types reject invalid shapes (`expectTypeOf`), including `exactOptionalPropertyTypes` cases.
- **Mutation:** `pnpm mutate` on the evidence, stage, mastery and planner modules.

---

## Docs and release

- **Docs**, written when the package exists, so `docs-check` can verify their imports: `packages/lk-practice/README.md` (the npm page: what it is, a short example, links); a `docs/practice.md` guide (concepts, the evidence table, stages, the planner and targets, the generation and decomposition flows, the evidence-levels table from this document, and how to use it with `lk-core`); the `docs/stability.md` section; the `docs/roadmap.md` §5 revision; `docs/upgrading.md` entries on each major.
- **Changesets:** independent versioning and the repository's release-note template (a bold headline, then `**Action required:**` where relevant). Until the release milestone the package is `"private": true`, so no changeset is required for it (`scripts/check-changesets.mjs` skips private packages) and the Release job cannot publish it by accident.
- **First release (revised, D9):** the package is created at `0.0.0`; the release milestone removes `"private": true` and adds a **minor** changeset, so the version PR takes it to **`0.1.0`**. Because a package's first publish cannot use trusted publishing, `0.1.0` is published by hand from the version-PR branch with `pnpm --filter . publish`, as `docs/releasing.md` §3a describes for `lk-azure`; later versions use trusted publishing. It stays on `0.x` through the beta and reaches **`1.0.0`** with a major changeset once the 1.0 criteria pass. `0.x` tells every consumer the API may still change.

---

## Roadmap

The branch-by-branch plan, with files, tasks, tests and gates for each milestone, is [lk-practice-milestones.md](lk-practice-milestones.md).

| Phase | Scope | Milestones | Exit criteria |
|---|---|---|---|
| **0 - Spike and design** | Decisions; the `ts-fsrs` 6 spike (done on 2026-11-01); this revision, the design and the milestones. | M0 | The three documents merged. |
| **1 - MVP** | Scaffold and wiring; domain types, canonical JSON and hashing, graph, item and extension validation; the FSRS-7 adapter; Elo, evidence mapping with skill outcomes, stage policy and mastery; log, record, replay, held and out-of-order evidence, host actions, events and state v1; the planner with targets, difficulty targeting, matching and coalescing; the grader, generator (with proof gate) and decomposition contracts; the simulator and vectors. | M1-M8, then M9 (release `0.1.0`) | Acceptance criteria 1-15; the Appendix A flow runs end to end against the built package. |
| **2 - The declarative scenario** | The `./lk-core` structural adapter and its contract test; the Appendix B placement flow (`prior` from a placement theta) with vectors. | M10 | Criteria 16-18. |
| **3 - Graph credit and tuning** | Opt-in encompassing credit; per-stage retention guidance; `costAdr` as an option; docs for host-side optimisation. | Later `0.x` | A simulation report; credit stays off by default unless that report shows a clear benefit. |
| **1.0** | API freeze, stability section, migrations, docs. | Final | Criteria 19-20. |
| **Later, not committed** | A hierarchical ability model as an optional `MasteryModel` (for hosts with a placement test); a BKT adapter; an opt-in `fsrs-6` model id; learned task difficulty for population hosts; a `lk-react` practice UI proposal; a Python port replaying the same vectors; Node 24 as the floor of the existing packages at their next majors. | - | Each its own proposal or milestone. |

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| FSRS is calibrated on flashcard recall of one card; a skill retrieved through many varied tasks, and procedural coding skills, may be forgotten differently. | Medium | The model is a port; per-stage retention; `exportReviewHistory` per skill and stage for host-side fitting; simulation; the assumption is stated in the docs, not hidden. |
| Generated tasks miss their target difficulty, so expected success drifts from `targetSuccess`. | High | Difficulty is a declared prior the check bounds; the host may log each target's expected success beside the observed outcome and recalibrate its generator; ability updates use the declared difficulty consistently, so a mis-estimate biases difficulty, not memory timing. |
| Learners memorise a task instance instead of the skill. | Medium | Memory is per skill; item cooldown and content-hash avoidance; `transfer` stages require new contexts. |
| A wrong decomposition of a goal teaches the wrong parts. | Medium | Structural checks; explicit admission by a person or the learner; extensions cannot alter base skills; `reset-skill` and a later extension replace a bad one. |
| Generated items are wrong. | High | The proof gate (R9.3); `model-checked` proofs off by default and recorded on the item. |
| A component task graded as a whole hides which part failed. | Medium | Per-skill outcomes and `criteria`; `skill.not-assessed` instead of guessing; the weight floor. |
| Scope creep into a learning platform (storage, UI, content, prompts). | High | Non-goals are permanent; the package returns state, entries, targets and events only. |
| Graph credit postpones reviews that were needed. | Medium | Off by default; capped; logged and replayable; never sets `mastered` on its own. |
| With one learner, task difficulty and BKT parameters cannot be learned. | High for single-learner hosts | Author and generator priors; Elo with fixed task difficulty. |
| `ts-fsrs` churn (v6 released 2026-10-28, a new helper dependency). | Medium | Exact pin, adapter isolation, no re-exported types, pinned short-term defaults, vectors that catch drift, the repository's `minimumReleaseAge`. |
| A Node 22 vs 24 split between the existing packages, hosts and this package. | Medium | Node 24 only for this package; the Node 22 CI leg filters it out; a host moves to Node 24 before it adopts; the existing packages move at their next majors, before Node 22's end of life. |
| AI grades of uneven quality distort schedules. | Medium | Confidence weights; held low-confidence grades; `lk-core` calibration on the host side. |
| The host's log store and snapshot disagree (a lost write, a retry). | Medium | Unique evidence ids in the store; the rolling log hash in the snapshot; `replay` as the recovery path. |
| Log growth over years of practice. | Low | Snapshots and `replayFrom` checkpoints; replay of 100,000 entries targeted under 2 s. |
| The stage ability offset (D27) is a placeholder: too large, and a promoted learner gets tasks that are too easy; too small, and ability is overstated after promotion. | Medium | Configuration; simulator comparisons; fresh uncertainty at a new stage lets the first retrievals there correct it. |
| `plan` misses its time budget on large graphs. | Low | Retrievability only for due and remediation candidates; a benchmark at the testing milestone with a documented fallback (design 8.6). |
| Floating-point differences across engines. | Low | Tolerances and rounding rules in the vectors (R12.2). |
| Over-promising ("master skills super fast", "revolutionary"). | Medium | Docs state evidence levels; no repetition-count or speed claims; the differentiation is stated as a combination of existing pieces. |
| The roadmap revision weakens "adaptive sequencing stays the host's". | Low | A separate opt-in package; `lk-core` and `lk-react` unchanged; the revision recorded in §5. |
| A host whose backend is not TypeScript (for example Python) cannot run the package in process. | Medium | D5: a Node 24 TypeScript process owns practice state; a Python port can replay the same vectors later. |

---

## Decisions (ADR-style)

Every question the first draft left open is decided here, so the builder has no open choice that changes the design. Each decision gives the choice, why, what follows from it, and what was rejected. **Default, changeable** marks a value or policy that can change later through configuration or a one-line edit here, without reworking the design; everything else is structural. **Revised** marks a decision that replaces the first draft's; D14 onwards are new in this revision, and D26-D28 come from the design review of the same date.

### D1 - Scheduler library and Node floor: `ts-fsrs` 6.x, FSRS-7, Node 24 (Revised)

- **Decision:** depend on `ts-fsrs` 6.x, pinned exactly, through the synchronous `defineScheduler` API and the `ts-fsrs/models/fsrs-7` subpath; `fsrs-7` is the only model id in the MVP; short-term behaviour is the library's FSRS-7 preset (`enableShortTerm: true`, `allowModelOverride: true`, `fractionalDays: true`, learning steps `['1m', '10m']`, relearning steps `['10m']`, maximum interval 36,500 days, fuzz off, no extra same-session re-checks), **pinned in the package's defaults**; the package declares `"engines": { "node": ">=24" }`.
- **Rationale:** FSRS-7 is the newest FSRS model and the library's default, and 6.0.0 is its current stable `latest`. The library's default short-term behaviour was chosen on purpose; pinning it in the package's own defaults keeps a library upgrade from changing schedules silently. Node 24 is the active LTS and the engine `ts-fsrs@6` declares; the spike showed the FSRS-7 path also runs on Node 20, so the floor is policy, chosen to follow the dependency's declared support, not a measured incompatibility. Node 22 reaches end of life on 2027-04-30. A new package's first floor breaks nobody.
- **Consequences:** R4.3, R4.5, R13.1 and R13.5 as written. The opt-in `fsrs-6` id of the first draft is cut (no user, double the vectors); a later model is a new id and a replay. A host on Node 22 moves to Node 24 before it adopts. The existing packages keep `>=22` until their own next majors; the PR that adds this package also adds "Node.js 24 as the floor" to the roadmap's "Held for the next major" list.
- **Rejected:** `ts-fsrs@5.4.2` on Node 22 (one model generation behind); an own FSRS implementation; the asynchronous `DefaultScheduler()` (every package function is synchronous); reading short-term defaults from the library at runtime (silent drift).

### D2 - Relationship to `lk-core`: independent, with a structural adapter (Revised)

- **Decision:** option A'. No dependency of any kind on `lk-core`; the `./lk-core` subpath declares structural copies of the `lk-core` shapes it reads; an in-repository contract test with `lk-core` as a devDependency proves them against the real types and real `evaluate` outputs.
- **Rationale:** the packages should be independent. An optional peer would still put this package in `lk-core`'s release cascade whenever `lk-core` takes a major, for a subpath most hosts never import. Structural typing gives the same convenience without the coupling; the contract test catches drift in CI, in the same repository.
- **Consequences:** no `peerDependencies`; `check-release-plan.mjs` does not list the package among `lk-core`'s dependents; `verify-dist` asserts no `@intellectif/lk-core` import anywhere in `dist/`; an `lk-core` change that breaks the structural types fails the contract test and is fixed in the same PR.
- **Rejected:** an optional peer (the first draft's option A: cascade coupling); a required peer (forces `lk-core` and its pinned zod on every host); a `./practice` subpath inside `lk-core`.

### D3 - Roadmap revision: adaptive sequencing gets its own opt-in package

- **Decision:** accepted. The PR that adds the package adds this row to `docs/roadmap.md` §5, "Standing decisions":
  `| Adaptive sequencing (what to practise next, and when) | Only in @intellectif/lk-practice, an opt-in package (2026-11-01). lk-core and lk-react stay free of it; storage, delivery, timers and taxonomy stay the host's. |`
  and changes the §4 sentence "not for adaptive sequencing, which stays the host's" to "not for adaptive sequencing, which stays out of `lk-core` and `lk-react` (see `lk-practice`)".
- **Rationale:** the promise the roadmap made was to keep the item runtime free of learner modelling; a separate package keeps that promise and meets the need of both host scenarios.
- **Consequences:** no change to `lk-core` or `lk-react`; the new package carries its own stability section.
- **Rejected:** leaving sequencing to each host (every host would hand-roll the same layer, untested); putting it in `lk-core`.

### D4 - What "mastered" means, stage numbers, and task difficulty (Default, changeable; Revised)

- **Decision:** the predicate in R3.5 (top stage reached; 2 spaced top-stage successes, each at least 72 hours after the previous counted one, the latest retrieval not a lapse; Elo expected success at the top stage at least 0.80 against the skill's `referenceDifficulty`; top-stage retrievability at least `desiredRetention - 0.10`), with a persisted `mastered` flag so a loss is reported on the next entry that touches the skill, whatever caused it. Stage policy `K = 2` spaced successes with a 24-hour gap measured from the previous counted success, `L = 2` (R3.2); while a streak waits for its next spaced success, the due time is capped at the moment that success can count. Unlocking is sticky and evaluated only when state changes; mastery is not sticky (R3.3). Elo on a logit scale with `K(n) = 1 / (1 + 0.05 n)`, one ability per skill and stage (R5.2, D27). Task difficulty is an author or generator prior relative to its stage, never learned; `learnItemDifficulty` is cut.
- **Rationale:** mastery must rest on retrieval **across time** and on the hardest form of the skill. With generated tasks the first draft's "mean top-stage item difficulty" drifts with the planner's own targeting, so an author-set standard replaces it. A margin below the desired retention, rather than a fixed 0.80, keeps the predicate meaningful when a host changes retention. Durations are hours because the core has no calendar. **(revised)** The first revision measured the gap as a span from the first success, so for `K > 2` all but the last success could fall in one sitting and `K` measured one gap, not `K - 1`; counting only spaced successes makes `K` mean `K` retrievals across sessions, as successive relearning does. Without the due cap, the model's interval after a success (about 4.8 days for a first `good`, R4.5) would postpone a promotion that only waited for 24 hours. The first revision also compared the predicate before and after an entry at the same instant, which never reports a loss caused by decay before the entry; the persisted flag does.
- **Consequences:** every number is configuration and part of the config hash; changing a default is a major (R11.4). `StageStreak` and the top-stage record keep the last counted success; `StageMemory` keeps the model's due time beside the capped one; `SkillState` keeps `mastered`.
- **Rejected:** a fixed repetition count; mastery from Elo alone; sticky mastery; learned task difficulty; a span from the first success (above); resetting the streak on a massed success (would punish extra practice); emitting mastery-loss events from `status` or `plan` (they would have to change state, or emit the same event on every call).

### D5 - Where the engine runs for a host whose backend is not TypeScript (Default, changeable)

- **Decision:** server side, in a **Node 24 TypeScript process that owns practice state**: the host's backend if it is TypeScript, or a small practice service beside a backend in another language (for example a Python web service) that calls it over HTTP. The browser may run `plan` for an offline preview, but the stored state and log are written only server side.
- **Rationale:** the learner's code is graded in a server-side sandbox, and tasks are generated server side, so evidence originates on the server; one writer keeps the log append-only and replayable.
- **Consequences:** the host's stack choice stays its own. A Python port is not committed; the shipped vectors keep one possible.
- **Rejected:** client-only state (two writers, easy to tamper with); a Python port before 1.0.

### D6 - Graph credit (FIRe-like): Phase 3, off by default

- **Decision:** not in the MVP. The MVP validates `encompasses` edges and uses them to bind components and coalesce targets (R3.4), never for implicit credit; Phase 3 implements credit behind an option that stays off until a simulation report shows it does not postpone needed reviews.
- **Rationale:** it is the least validated idea here and the one most able to hide a needed review. Per-component grading (D19) gets most of its benefit with real outcomes instead of inferred ones.
- **Rejected:** shipping it in the MVP behind a flag.

### D7 - Evidence policy (Default, changeable)

- **Decision:** the R7.2 table: medium-confidence AI grades count at weight 0.5 and never yield `easy`; low-confidence or review-flagged AI grades are held until confirmed; self-ratings move memory as rated and count at weight 0.5 for ability; `easy` comes only from `fluentSeconds` set by the host, or from a self-rating; **(revised)** an opt-in, host-set `slowSeconds` maps a slower first-try, no-hint pass to `hard`, with no default; supplementary evidence for the same attempt updates ability only.
- **Rationale:** AI grading quality must be measured per rubric before it counts fully; one attempt must never count as two reviews of a skill; fluency inferred from time alone would be guesswork. Response time falls with practice and practised performance becomes automatic (the evidence table), so a pass far slower than fluent performance is weaker evidence of a durable skill and a shorter next interval is the cautious choice; how slow is too slow depends on the task's length, reading and typing, so only the host can set it.
- **Rejected:** discarding AI grades; trusting them fully; inferring `easy` from speed without an author's threshold; a default slow threshold; letting slowness lower `correct` or ability (a correct answer is still correct).

### D8 - Exams: ability always; the schedule only when they reveal forgetting

- **Decision:** exam evidence updates ability at full weight. A failed exam answer counts as a lapse under the implication rule; a passed one does not move the schedule. `examsMoveSchedule: true` opts in to full scheduling. Diagnostic and pretest contexts never move the schedule (R7.3).
- **Rationale:** a failure in an exam is real evidence of forgetting; a pass after cramming is weak evidence of durable memory.
- **Rejected:** exams never touching memory; exams always moving it.

### D9 - Release path: private scaffold, public `0.1.0`, then 1.0 after dogfooding (Revised; durations Default, changeable)

- **Decision:** the package is `"private": true` from the scaffold until the release milestone; the release milestone removes it and adds a **minor** changeset, so `0.0.0` becomes `0.1.0`, published by hand as `docs/releasing.md` §3a describes; `0.x` minors follow; `1.0.0` once the 1.0 criteria pass, including at least 60 days of real use in a code-practice host and 30 days in a language-practice host.
- **Rationale:** a public `0.0.0` package merged to `main` would make the Release job try to publish it on the next version run; `private` prevents that and lets `check-changesets.mjs` skip the package while it is unfinished. A minor from `0.0.0` gives `0.1.0` (the first draft's text described `lk-azure`'s major-to-`1.0.0` path, which does not apply). Hosts live in other repositories and need a published version.
- **Consequences:** each MVP milestone merges without a changeset; the release milestone carries the only one.
- **Rejected:** `1.0.0` straight away; a public `0.0.0` during the build; workspace-only consumption.

### D10 - Name: `@intellectif/lk-practice`

- **Decision:** `@intellectif/lk-practice`.
- **Rationale:** it names the purpose (practice: what, how and when), not one mechanism.
- **Rejected:** `lk-srs` (too narrow), `lk-mastery` (one of its models), `lk-adaptive` (too broad, and echoes the retired "adaptive hooks").

### D11 - Home of this document, the design and the milestones (Revised; Default, changeable)

- **Decision:** this proposal stays at `docs/lk-sdk-practice-requirements.md`. The build design is `docs/lk-practice-design.md` and the milestone plan `docs/lk-practice-milestones.md`, also in `docs/`. When `docs/practice.md` ships (release milestone), the guide becomes the reference and these three documents are moved out of `docs/` or deleted in the same PR, so `docs/` describes shipped code.
- **Rationale:** `docs/internal/` is listed in `.gitignore`, so a plan there (as `lk-azure`'s was) would be invisible to the repository, to review and to `pnpm docs-check`; the first draft's pointer to `docs/internal/lk-practice-plan.md` could never have been committed.
- **Rejected:** `docs/internal/` (ignored); weakening the docs check for proposals.

### D12 - Time representation: integer epoch milliseconds everywhere

- **Decision:** `number` epoch milliseconds (UTC) in the API, in stored state and in the log; `due` is an integer; durations are milliseconds or hours; the host passes `dueBy` for "today".
- **Rationale:** compact, comparable, timezone-free and identical across JSON and every runtime; the FSRS adapter converts with `new Date(ms)` at the boundary.
- **Rejected:** ISO strings in stored state; fixed time-zone offsets or calendar days in the core.

### D13 - Default stage ladders (Default, changeable; Revised)

- **Decision:** `recognise -> recall -> produce -> apply` (declarative) and `example -> complete -> write -> transfer` (procedural) as defaults; a skill may override its ladder, including a one-stage ladder; a `mixed` skill **must** declare its ladder. Stages are ordered across ladders by their demand (D28).
- **Rationale:** memory is per skill and stage (D14), so a skill's ladder cannot depend on which item arrives, as the first draft's "a mixed skill uses its items' ladder" allowed.
- **Rejected:** no defaults; a single universal ladder; item-dependent ladders.

### D14 - The unit of memory is the skill at its stage

- **Decision:** one memory per (skill, stage), active only at the skill's current stage; items are disposable instances; no item-keyed memory; `variantOf` removed; item usage kept only for freshness (cooldown 7 days, retention 30 days).
- **Rationale:** generated tasks are produced on demand and seen once; keying memory to an item would start every generated task as a new card and inflate due work without end. The knowledge-component literature tracks learning per skill, not per item. A promotion starts a fresh memory because retrieving a skill in a harder form is a different memory task; the lower stage's memory is kept, superseded, for demotion and for history.
- **Consequences:** the FSRS port is keyed to a skill and stage (R4.1); replay needs no item pool (D21); `exportReviewHistory` reports per skill and stage. Whether FSRS fits a skill memory as well as a card is an untested assumption (Risks).
- **Rejected:** item memories with family sharing (the first draft's `variantOf`: generated tasks have no stable family); one memory per skill across all stages (the stage change would confound the memory estimate).

### D15 - Stage implication rule

- **Decision:** a success at or above the current stage counts as a success at the current stage; a failure at or below it counts as a lapse at the current stage; other evidence updates ability only. Stages are compared through the skill's equivalent of the task's stage (R3.8), so the rule also covers a task from another ladder.
- **Rationale:** succeeding at writing code implies the learner could have completed it; failing to complete it implies they could not write it. The converse inferences do not hold, so they do not move memory.
- **Rejected:** ignoring off-stage evidence (wastes real signal, and multi-skill tasks are often off-stage for a component); applying all evidence at the evidence's own stage (would create memories at stages the learner has not reached).

### D16 - Multi-skill attempts: one retrieval per skill, with a weight floor (Default, changeable)

- **Decision:** a task updates each of its skills at most once per attempt; a skill's memory takes a review from an explicit skill outcome, or from the overall outcome when its item weight is at least `memoryWeightFloor` (0.3); ability is always updated at evidence weight times item weight.
- **Rationale:** a realistic task (an LLM call) retrieves several skills at once; a skill that is a small part of a task is not reliably retrieved by it, so the floor stops it being counted as a review.
- **Rejected:** primary skill only (wastes the multi-skill signal that per-component tracking needs); every listed skill at full weight (inflates reviews of minor skills).

### D17 - The planner returns practice targets, with difficulty targeting and just-in-time re-planning (Default, changeable for the numbers)

- **Decision:** `plan` returns targets (skills, stage, target difficulty, tolerance, constraints, reason, an optional matched item). Target difficulty gives expected success `targetSuccess` (0.85, range [0.6, 0.95]); tolerance 0.5 logits. Tiers: overdue, remediation, due, stage-up, new (then opt-in pretest). Coalescing on, up to 4 skills; a due component joins when its equivalent stage of the target's stage is its current stage (R3.8). Hosts re-plan after every record.
- **Rationale:** the host's AI generates the task, so the planner must say what to generate, not which card to show. Wilson et al.'s 85% figure is a training error rate in a learning model; it is used for difficulty, kept distinct from `desiredRetention`, and stated at its real evidence level. Re-planning replaces stateful session logic and makes a 1-minute relapse (R4.5) reappear naturally.
- **Rejected:** returning items only (cannot drive generation); a stateful session object (state outside the log); one difficulty for all learners.

### D18 - Generated tasks from day one, with a self-contained log

- **Decision:** the generator contract and the proof gate are in the MVP; each evidence log entry carries a `TaskSnapshot`; `acceptProofs` defaults to `executable` and `reviewed`.
- **Rationale:** a host uses its existing exercises (acceptance checks as `auto` evidence) and AI-generated items from the start. A self-contained log lets the host discard generated tasks after use while replay still works.
- **Rejected:** a generator in the beta (a generating host needs it from the first release); storing every generated item for replay (the package should not dictate content storage).

### D19 - Fine-grained evidence: skill outcomes and criteria

- **Decision:** `Evidence.skillOutcomes`; `PracticeItem.criteria` binding grader criteria or test groups to skills; the `./lk-core` adapter and `evidenceFromGrade` map criteria to outcomes; a component without an outcome is not assessed.
- **Rationale:** tracking each part of a syntax separately is a goal (Appendix A); graders already report per-criterion scores (`lk-core`'s `CriterionScore`, pytest test groups), so the signal exists.
- **Rejected:** inferring component outcomes from the overall score (guesswork); separate tasks per component only (loses the integrated retrieval).

### D20 - Goal-driven graph extensions and a decomposition contract

- **Decision:** `GraphExtension`, `composeGraph`, and the decomposition contract (`decompositionRequest`, `checkDecomposition`, `admitExtension`) are in the MVP; an extension may not add an edge into a base skill; learner approval is allowed for the learner's own goals (configurable).
- **Rationale:** a learner's goal ("write an LLM call") rarely matches the host's graph; an AI decomposition, checked and admitted, extends it without the package inventing skills, and without altering skills the host authored.
- **Rejected:** the package decomposing goals (it has no model and must not); free-form graph edits by AI (could break readiness of authored skills).

### D21 - Log, snapshot and replay mechanics

- **Decision:** the state is a snapshot with a log header (length, last instant, rolling FNV-1a 64-bit hash); the host owns the log store, with a unique key on the evidence id; log order is `(at, seq)`; out-of-order evidence and late confirmations of held evidence return `replay-required` with the instant to replay from; `replayFrom` continues from a stored snapshot; a recent-id window gives cheap duplicate detection.
- **Rationale:** a state that embeds its full log grows without bound; append-only logs with checkpoints are the standard way to keep replay exact and cheap.
- **Rejected:** dropping out-of-order evidence; applying late evidence at arrival time (breaks replay equality); storing the log inside the state.

### D22 - Host actions and evidence contexts

- **Decision:** host actions in the log: `prior` (theta and pseudo-count), `place` (stage, optionally credited), `suspend`, `unsuspend`, `discard-held`, `reset-skill`. Contexts: `practice`, `exam`, `diagnostic` (ability only) and `pretest` (weight 0, opt-in). `learnerConfidence` on evidence, with an `evidence.confident-error` event.
- **Rationale:** placement (for example a Rasch theta from a placement test), leech handling and grading workflows are host decisions that must still replay; pretesting and confidence are cheap hooks for effects with moderate evidence.
- **Rejected:** host edits to state (not replayable); confidence changing ratings in the MVP (no validated mapping).

### D23 - Determinism specifics

- **Decision:** canonical JSON (sorted keys, no whitespace, finite numbers only) and FNV-1a 64-bit for the config hash, log hash, target ids and seeded tie keys; `due` is an integer millisecond (half-up rounding if the library ever returns a fraction); floats compared at relative 1e-9; discrete outputs exact; a static and a runtime purity check over `dist/`. The details are in [the design, "Determinism"](lk-practice-design.md#9-determinism).
- **Rationale:** a non-cryptographic hash is enough for change detection and tie-breaking, is small, and is easy to port; sorting by a hashed key is order-independent, unlike a random stream.
- **Rejected:** a cryptographic hash (needs `crypto`, which the neutral build avoids); a PRNG stream for ties (results depend on call order).

### D24 - Leeches counted by the package (Default, changeable)

- **Decision:** 8 lapses on a skill's stage memory suspend the skill (`skill.leech`); the host may re-teach, decompose (D20) or `unsuspend`.
- **Rationale:** `ts-fsrs`'s leech middleware is off by default (threshold 0) and card-keyed; 8 is Anki's default threshold, a familiar starting value with no stronger evidence behind it.
- **Rejected:** no leech handling (a learner loops on a broken skill); the library middleware.

### D25 - Ability model for hosts with a placement test: per-skill Elo now, hierarchical later

- **Decision:** a host with a placement test uses the default Elo (per skill and stage), started from its placement theta through `prior` host actions at the stage it places each skill; a hierarchical model (overall ability plus per-skill offsets) may come later as an optional `MasteryModel`.
- **Rationale:** the port makes a later model a replay, not a rewrite; Elo with priors gives "placement becomes the first value of each skill's ability" today.
- **Rejected:** building the hierarchical model in the MVP (no host scenario needs it yet).

### D26 - Configuration is plain data; models and policies are referenced by id, version and params

- **Decision:** `ResolvedPracticeConfig` holds only JSON data: every option resolved, plus `{ id, version, params }` (`PolicyRef`) for the memory model, the mastery model, the stage policy and the evidence mapper. The callable instances live in the `createPractice` closure; `Practice.config` exposes the data. `PracticeConfig` takes a custom policy (`stagePolicy`, `evidenceMapper`) or the built-in one's options (`stagePolicyOptions`, `evidenceOptions`) in separate fields; setting both for one policy is `CONFIG_CONFLICT`. The config hash covers the resolved data, so it covers each instance's id, version and params.
- **Rationale:** the first revision typed `stagePolicy` as `StagePolicy | StagePolicyOptions` (and `evidenceMapper` likewise) and hashed the resolved configuration, which would have put functions inside canonical JSON - rejected by the canonical form (design section 9), or, if silently dropped, two different policies would hash alike. A function cannot be hashed deterministically across engines; an id, a version and data parameters can.
- **Consequences:** a custom policy must bump its version when its behaviour changes; its params must be canonical JSON; `mapEvidence` and `admitCandidate` take the data configuration; the domain milestone tests the hash for default and custom configurations.
- **Rejected:** hashing function source text (engine-dependent, ignores closures); a module-level registry of policies (module state, R1.1); the union-typed fields (functions in the hashed data).

### D27 - Ability per skill and stage, with stage-relative task difficulty (Default, changeable for the offset)

- **Decision:** a task's `difficulty` is relative to its stage (0 is a typical task at that stage). The mastery model keeps one ability per (skill, stage). A stage's ability, when first needed, is derived from the nearest stage of the skill that has one, `theta - stageOffset * (demand(new) - demand(from))`, with fresh uncertainty; at a new skill it is `masteryPrior` at the first stage, shifted the same way. Evidence updates the ability of the skill's equivalent of the task's stage. `prior` sets the ability at a named stage, by default the current one. The predicate's condition (c) reads the top stage's ability against `referenceDifficulty`, on the top stage's scale. `stageOffset` defaults to 1 logit per demand step.
- **Rationale:** with one theta and absolute difficulty (the first revision), the typical tasks of each stage sit at different points of one scale, so right after a promotion the planner asked for tasks easier than any real task of the new form and the matcher rejected the new stage's authored items. Stage-relative difficulty removes that shift: authors and generators rate a task against its own form. Keeping one theta with stage-relative difficulty would carry the lower stage's ability unchanged into a harder form, overstating it after promotion, and lower-stage successes would inflate condition (c). Per-stage ability measures each form on its own evidence; seeding it from the stage below, lowered by an offset, starts near what the evidence suggests instead of a cold prior, and fresh uncertainty lets the first retrievals there correct the seed quickly. Condition (c) then means "expected success on a typical top-stage task", which is what mastery should claim.
- **Consequences:** `SkillState.ability` is a map by stage; `MasteryModel` gains `derive`; `plan`, generation facts and `status` read the stage's ability; the offset has no empirical basis yet, so it is configuration, simulated (0, 0.5, 1) and part of the config hash; vectors cover post-promotion targeting. With `targetSuccess` 0.85 the planner still asks for tasks about 1.7 logits below the learner's ability at that stage, so authored items near 0 match once ability there approaches 1.7; generated tasks fill the gap before that, which is the intended flow.
- **Rejected:** one theta with absolute difficulty (the shift above); one theta with stage-relative difficulty (overstates ability after promotion); per-stage ability started cold at `masteryPrior` (discards the lower stage's evidence); learning a per-stage offset from data (one learner cannot calibrate it).

### D28 - Stage demand and equivalence across ladders (Default, changeable for the values)

- **Decision:** each stage id has a numeric demand (`stageDemand`; defaults `recognise` and `example` 1, `recall` and `complete` 2, `produce` and `write` 3, `apply` and `transfer` 4) that strictly increases along every ladder; an undeclared stage falls back to its normalised position (R3.8) with a warning, and an ambiguous fallback is an error. The equivalent stage of a stage for a skill drives the implication rule, coalescing, item validation, ability updates and generation facts.
- **Rationale:** a composite task often exercises components on another ladder (a procedural call with a declarative component); the first revision coalesced only components that had the target's exact stage, and judged evidence from another ladder by nothing. Explicit demand makes the comparison host data; the normalised position is only a fallback, because ladders of different lengths do not align by position. The default pairing (worked example with recognition, completion with recall, writing with production, transfer with application) is a design judgement, not a measured equivalence.
- **Rejected:** comparing ladder positions directly (ladders of different lengths); one shared ladder for every skill; declared pairwise equivalences (quadratic data, and still no order).

### Product defaults

None blocks the build. The values marked **Default, changeable** (D4, D5, D7, D9, D11, D13, D16, D17, D24, D27, D28) are where product judgement may later differ; each can change without reworking the design.

---

## Appendix A - a Python coding host: a generated-practice flow

The example goal: **write a chat-model call to an LLM in Python, with its basic parameters, from memory, understanding each part of the syntax.** The code uses an illustrative client library, `llm_client`, with a shape common to LLM clients; it is not a real package, it stands for whichever client a host teaches, and nothing in this package depends on it. A finished retrieval at the `write` stage looks like this:

```python
from llm_client import ChatModel

model = ChatModel(
    "provider:model-name",
    temperature=0,
    max_tokens=256,
    max_retries=2,
)
response = model.invoke([
    ("system", "You answer in one sentence."),
    ("user", "What does a retriever return?"),
])
print(response.content)
```

### The goal becomes skills

The learner states the goal; the host asks its own model to decompose it, using the facts from `decompositionRequest`; the package checks the proposal and the learner admits it. The admitted extension below is illustrative; `py.imports` and `py.kwargs` stand for skills the host's graph already has.

| Skill id | Part of the call | Edges |
|---|---|---|
| `llm.call` | The whole call: build a model, send messages, read the reply | encompasses every component below (weights summing to 1 are not required; each is at most 1) |
| `llm.call.import` | `from llm_client import ChatModel` | prerequisite `py.imports` (hard); soft prerequisite of `llm.call` |
| `llm.call.model-id` | The `"provider:model-name"` string | soft prerequisite of `llm.call` |
| `llm.call.temperature` | `temperature`, and why 0 makes output (near) deterministic | prerequisite `py.kwargs` (hard); soft prerequisite of `llm.call` |
| `llm.call.max-tokens` | `max_tokens` caps the reply length | prerequisite `py.kwargs` (hard); soft prerequisite of `llm.call` |
| `llm.call.retries` | `max_retries` for transient provider errors | prerequisite `py.kwargs` (hard); soft prerequisite of `llm.call` |
| `llm.call.messages` | A list of `(role, text)` messages | soft prerequisite of `llm.call` |
| `llm.call.invoke` | `.invoke(...)` and `response.content` | soft prerequisite of `llm.call` |

All are `procedural` (default ladder `example -> complete -> write -> transfer`), so a composite target at any stage can coalesce its due components. The extension adds edges only from base skills (`py.imports`, `py.kwargs`) to new ones, never into a base skill (R2.6), and every component is also a prerequisite of the composite, so `validateGraph` raises no `ENCOMPASSES_WITHOUT_PREREQUISITE` warning.

### The loop

```ts
// Proposed exports of @intellectif/lk-practice (not built yet, so no import line here):
// createPractice, decompositionRequest, checkDecomposition, admitExtension, composeGraph,
// generationRequest, checkCandidates, admitCandidate, evidenceFromGrade.
// `now`, `submittedAtMs`, ids and the host* functions belong to the host.

const practice = createPractice(); // FSRS-7, Elo, targetSuccess 0.85, coalescing on

// 1. Goal -> admitted extension -> composed graph (once per goal).
const goal = { id: 'goal.llm-call', text: 'Write an LLM chat-model call in Python from memory', anchorSkillIds: ['py.imports', 'py.kwargs'] };
const dreq = decompositionRequest(goal, baseGraph, { idPrefix: 'llm.call', maxSkills: 8, seed: goal.id });
const checked = checkDecomposition(dreq, baseGraph, await hostDecompose(dreq)); // the host's model call
if (!checked.ok) return showIssues(checked.issues);
const admitted = admitExtension(checked.extension, { by: 'learner', at: now });
if (!admitted.ok) return showIssues(admitted.issues);
const composed = composeGraph(baseGraph, [admitted.extension]);
if (!composed.ok) return showIssues(composed.issues);
const graph = composed.graph;

// 2. Plan: targets, not cards. The host's authored exercises are the proven pool.
const plan = practice.plan(state, graph, {
  now,
  seed: sessionId,
  budget: { maxSeconds: 1200 },
  focusSkills: ['llm.call'],
  pool: provenExercises,
});
const target = plan.targets[0];

// 3. No pool item matches: generate, check, prove, admit.
let item = target.item ? poolById.get(target.item.itemId) : undefined;
if (item === undefined) {
  const greq = generationRequest(target, { graph, state, now }, { count: 3, seed: target.id });
  const { accepted } = checkCandidates(greq, await hostGenerate(greq)); // the host's model call
  for (const candidate of accepted) {
    const proof = await sandboxProve(candidate); // reference passes, a known-wrong solution fails
    if (!proof.ok) continue;
    const result = admitCandidate(candidate, {
      kind: 'executable',
      referencePassed: true,
      wrongSolutionsFailed: proof.wrongSolutionsFailed,
      at: now,
    });
    if (result.ok) {
      item = result.item;
      break;
    }
  }
}

// 4. The learner attempts it; the sandbox runs one pytest group per part of the call.
const run = await sandboxGrade(item, learnerCode); // e.g. groups: import 1/1, model-id 1/1, temperature 0/1, ...
const evidence = evidenceFromGrade(
  {
    score: run.passed,
    maxScore: run.total,
    passed: run.passed === run.total,
    checks: { passed: run.passed, total: run.total },
    criteria: run.groups.map((g) => ({ name: g.name, score: g.passed, maxScore: g.total })),
    grader: { kind: 'auto', id: 'pytest' },
  },
  item,
  { id: attemptId, itemId: item.id, at: submittedAtMs, attempts: 0, hintsUsed: 0, targetId: target.id },
);
const result = practice.record(state, { graph, item, evidence });
if (result.kind === 'applied') {
  await logStore.append(result.appended); // unique key on the evidence id
  state = result.state;
}
// 5. Re-plan for the next target (R6.9). A missed `temperature` is due again in minutes,
//    as its own target or coalesced into the next `llm.call` task.
```

Only the host calls a clock or a model; the package's own code never does.

### What each stage asks for

| Stage | Task form for `llm.call` | Evidence |
|---|---|---|
| `example` | Read a call; predict what `response.content` holds and which argument makes the output repeatable | `auto` (exact answer) or `exposure` |
| `complete` | Fill in the missing import, model string and keyword arguments of a partial call | `auto`, one test group per blank, bound by `criteria` |
| `write` | Write the call from a specification ("the provider's fast model, repeatable output, at most 256 tokens, two retries, print the text") | `auto`, one pytest group per part |
| `transfer` | Fix a broken call (a wrong import path, a missing provider prefix), or wrap the call in a function used in a new context | `auto`; an `ai` code review may supplement it (`supplements`), updating ability only |

### Existing exercises as authored items

Each existing exercise becomes a `PracticeItem` with `origin: 'authored'`, the lesson's learning objectives as its skills, a stage from its form, and its acceptance checks as `auto` evidence. The host's convention - the checks fail on the starter and pass on the solution - is an `executable` proof (the solution is the reference, the starter the known-wrong solution), so every exercise enters the pool proven. An AI-generated item meets the same bar before a learner sees it (R9.3).

## Appendix B - a language-learning host with a skill map and a placement test

| Host concept | `lk-practice` concept |
|---|---|
| objective id | `SkillNode.id` |
| objective kind | `SkillNode.knowledge`, by a host mapping (for example form-focused objectives to `declarative`, can-do performance objectives to `procedural`), plus `tags`; `mixed` objectives declare a ladder |
| can-do statement | `SkillNode.description`, a fact for generators |
| level band (for example CEFR A1-C2) | `tags` (opaque to the package); optionally `masteryPrior` and `referenceDifficulty` |
| hard and soft prerequisites (kept acyclic) | `prerequisite` edges with `strength` |
| lesson activities (`lk-core` items) | `PracticeItem`s tagged with objective ids; the stage follows from the activity form |
| AI-generated practice | targets from `plan`, turned into `lk-core` activities by the host's generator, admitted through the proof gate |
| a practice scoring policy where the first try counts | `attempts` and `hintsUsed` on the evidence decide between `hard` and `good` |
| placement test (for example a Rasch theta) | `prior` host actions per objective, at the stage the host places it (D25); `place` only where the host's policy grants credit |
| exams | `context: 'exam'` evidence (D8) |
| per-objective ability | `eloMasteryModel` per stage, started from placement; a hierarchical model later (D25) |
| written-response graders with calibration | stay in the host with `routeGrade` and `calibrationReport`; their `GradeRecord` reaches the package through `evidenceFromOutcome`, with rubric criteria mapped to objectives |

```ts
import { evaluate } from '@intellectif/lk-core';
// Proposed: evidenceFromOutcome from @intellectif/lk-practice/lk-core (not built yet).

// Placement: one prior per objective, from the placement theta (the pseudo-count is the host's choice).
const placed = practice.act(state, graph, {
  id: `prior:${placementId}:${objectiveId}`,
  at: placedAtMs,
  action: { kind: 'prior', skillId: objectiveId, theta: thetaForObjective, pseudoCount: 10 },
});

// Practice: an lk-core outcome becomes evidence.
const outcome = evaluate(activity, response, options);
const evidence = evidenceFromOutcome(outcome, item, {
  id: attemptId,
  itemId: item.id,
  at: submittedAtMs,
  attempts,
  hintsUsed,
});
if (evidence !== null) {
  const result = practice.record(state, { graph, item, evidence });
}
```

A host still on Node 22 moves to Node 24 before this example runs (D1).

---

## Sources

Read for this document or for the fact-check that preceded it. Where a source was not re-read, that is stated.

- `ts-fsrs` on npm (versions 6.0.0 and 5.4.2, engines, dependencies): https://www.npmjs.com/package/ts-fsrs and https://registry.npmjs.org/ts-fsrs ; documentation: https://open-spaced-repetition.github.io/ts-fsrs/
- `@open-spaced-repetition/srs-kit` on npm: https://www.npmjs.com/package/@open-spaced-repetition/srs-kit
- The open SRS benchmark (FSRS, HLR and Ebisu log loss): https://github.com/open-spaced-repetition/srs-benchmark
- `femto-fsrs`: https://www.npmjs.com/package/femto-fsrs ; `ebisu-js`: https://www.npmjs.com/package/ebisu-js
- Settles, B. & Meeder, B. (2016). A Trainable Spaced Repetition Model for Language Learning. ACL. https://doi.org/10.18653/v1/P16-1174 ; code: https://github.com/duolingo/halflife-regression
- ALEKS and Knowledge Space Theory: https://www.aleks.com/about_aleks/knowledge_space_theory
- Wiley's purchase of Knewton (2019): https://www.insidehighered.com/digital-learning/article/2019/05/07/wiley-buys-knewton-adaptive-learning-technology-company
- Math Academy on spaced repetition in hierarchical knowledge structures: https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/ and https://www.mathacademy.com/how-our-ai-works
- pyBKT: https://github.com/CAHLR/pyBKT ; https://arxiv.org/abs/2105.00385
- Pelánek, R. (2016). Applications of the Elo rating system in adaptive educational systems. Computers & Education. https://doi.org/10.1016/j.compedu.2016.03.017 ; preprint read on 2026-11-01 for the uncertainty function: https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- Pelánek, R., Papoušek, J., Řihák, J., Stanislav, V. & Nižnan, J. (2017). Elo-based learner modeling for the adaptive practice of facts. User Modeling and User-Adapted Interaction (`b = 0.06`): https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf
- `ts-fsrs` 6.0.0 README (Node `>=24.0.0`, `defineScheduler`, FSRS-7 default, learning steps), read from the npm registry on 2026-11-01.
- Node.js release schedule (Node 22 end of life 2027-04-30; Node 24 LTS): https://github.com/nodejs/release#release-schedule
- Sarsa, S., Denny, P., Hellas, A. & Leinonen, J. (2022). Automatic Generation of Programming Exercises and Code Explanations Using Large Language Models. ICER. https://doi.org/10.1145/3501385.3543957
- Brunmair, M. & Richter, T. (2019). Similarity matters: A meta-analysis of interleaved learning and its moderators. Psychological Bulletin (from the earlier fact-check).
- Vocabulary repetition ballparks - Webb (2007), Nation, Nakata - from the earlier fact-check, not re-read for this document.
- Wilson, R. C., Shenhav, A., Straccia, M. & Cohen, J. D. (2019). The Eighty Five Percent Rule for optimal learning. Nature Communications, 10, 4646. https://doi.org/10.1038/s41467-019-12552-4 (the claim used here: an optimal training error rate of about 15.87% for gradient-descent learners on binary classification; from the earlier fact-check, not re-read for this revision).
- Koedinger, K. R., Corbett, A. T. & Perfetti, C. (2012). The Knowledge-Learning-Instruction framework. Cognitive Science (not re-read).
- Rawson, K. A., Dunlosky, J. & Sciartelli, S. M. (2013). The power of successive relearning. Educational Psychology Review (not re-read).
- Richland, L. E., Kornell, N. & Kao, L. S. (2009). The pretesting effect: Do unsuccessful retrieval attempts enhance learning? Journal of Experimental Psychology: Applied; Kornell, N., Hays, M. J. & Bjork, R. A. (2009). Unsuccessful retrieval attempts enhance subsequent learning. Journal of Experimental Psychology: Learning, Memory, and Cognition (neither re-read).
- Butterfield, B. & Metcalfe, J. (2001). Errors committed with high confidence are hypercorrected. Journal of Experimental Psychology: Learning, Memory, and Cognition (not re-read).
- `ts-fsrs` 6.0.0 configuration and middleware (`enableShortTerm`, `allowModelOverride`, `fractionalDays`, `learningSteps`, `relearningSteps`, `maximumInterval`, `enableFuzz`; `ts-fsrs/middlewares`; `ts-fsrs/models/fsrs-7`), read from the published package and exercised in the spike on 2026-11-01.
- `@intellectif/lk-core` 1.8.0 API report (`ItemOutcome`, `GradeRecord`, `CriterionScore`, `Grader`), `packages/lk-core/api/surface.md` in this repository.
- Newell, A. & Rosenbloom, P. S. (1981). Mechanisms of skill acquisition and the law of practice. In J. R. Anderson (Ed.), Cognitive Skills and Their Acquisition (not re-read).
- Logan, G. D. (1988). Toward an instance theory of automatization. Psychological Review (not re-read).
- `ts-fsrs` 6.0.0 `ts-fsrs/models/fsrs-7` exports (`curve`, `checkFSRS7Parameters`, `FSRS7_DEFAULT_WEIGHTS`), read from the installed package on 2026-11-01; `curve` timed on the build box (Node 20.19, 10^6 calls in about 0.36 s).
