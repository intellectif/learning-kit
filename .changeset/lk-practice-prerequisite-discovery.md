---
'@intellectif/lk-practice': minor
---

**`@intellectif/lk-practice`: missing prerequisites, found by a model's hypothesis and confirmed by probes, never by the model alone**

**Action required:** rebuild stored states with `replay`, give the new target kind, events and host actions a default branch in your code, and replay a learner's log after you admit a hypothesis.

- **Rebuild stored states.** The rules version and the new `discovery` options are in the configuration hash, so a state saved by 0.3 is refused with `STATE_CONFIG_MISMATCH`. `replay` the learner's log and store the new state. Logs are unchanged and stay valid.
- **Give the new values a default branch.** A plan may now hold a `probe` target, in context `diagnostic`, with the reason `probe`, and a `remediation` target with the reason `discovered`; a generation request for a probe has `target.context: 'diagnostic'`. `record` and `act` may emit `skill.diagnosis-suggested`, `hypothesis.opened`, `hypothesis.probed`, `hypothesis.decided`, `hypothesis.ready`, `hypothesis.closed` and `skill.unsuspended`. Two host actions are new: `open-hypothesis` and `close-hypothesis`. `composeGraph` takes a second extension kind, `prerequisite-discovery`.
- **Admitting a hypothesis changes the graph version,** as any extension does: compose the new graph and `replay` the learner's log against it before the next `record`.

What it does:

- **A diagnosis is suggested:** `record` emits `skill.diagnosis-suggested` when a skill fails twice in a row at its stage (`discovery.diagnoseAfter`) and no diagnosis of it is under way.
- **A model proposes, the package checks:** `prerequisiteRequest` gives your model the facts (the blocked skill, the failure, its prerequisites, the skills near it, hypotheses already open or refuted); `checkPrerequisiteHypothesis` checks its `{ hypotheses: [...] }` output (`hypothesesJsonSchema`, `hypothesesSchema`). Each hypothesis names an existing skill, or a new one under your prefix, and one soft prerequisite edge into the blocked skill. The package never calls a model.
- **Probes decide:** after `open-hypothesis`, plans start with a probe of the candidate alone, at its top stage and reference difficulty. A probe answer (`evidence.probe`) changes no skill. Two failed probes confirm, a pass share of 0.75 or more refutes (two of two, three of four), and at four probes doubt confirms; `prerequisiteVerdict` reads the result. A refuted hypothesis is remembered for the learner.
- **A confirmed one is a soft edge:** `discoveryExtension` returns a `prerequisite-discovery` extension, the one kind allowed an edge into a base skill: one soft prerequisite into the blocked skill, plus the candidate if it is new. Two such extensions that add the same new skill share it.
- **Practice first:** the planner plans the confirmed prerequisite, then re-probes it, while the blocked skill waits. Two passed re-probes in a row (`discovery.readyAfter`) make it ready, and the blocked skill gets a fresh start: an ability pulled below its starting point by the explained failures starts again there, its lapse counts and streaks restart, and a leech suspension is lifted. Nothing is ever lowered.
- **You decide:** `prerequisiteReport` advises `admit`, `practise`, `harden`, `revoke` or `keep` for each confirmed hypothesis. Nothing hardens or revokes itself.
- **`./testing`:** `requires` gives a simulated skill hidden prerequisites, and `learning` lets its true ability grow with practice (never with a probe). `bench/discovery.mjs` reports the effect.

On 400 simulated learners whose blocked skill needed a prerequisite missing from the map, none mastered it in 180 days without discovery; with it, the true prerequisite was admitted for 358, and 164 mastered the skill (median day 77). With nothing missing, mastery was unchanged (354, median day 64) and 5 needless prerequisites were admitted. `harden` cannot tell a needed prerequisite from one that was merely missing (76 of 434 such advices named a decoy), so judge the content before you harden.

Guide: https://github.com/intellectif/learning-kit/blob/main/docs/practice.md#missing-prerequisites
