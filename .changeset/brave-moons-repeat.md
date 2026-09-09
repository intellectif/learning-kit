---
'@intellectif/lk-core': patch
'@intellectif/lk-react': patch
---

Close two more fail-open leaks in `redact()`, bind a play budget on an essay slot, and make three guards that could not fail actually fail.

Everything here is a defect in 0.8.0 / 7.0.0, found by auditing that release rather than by using it.

**`redact()` leaked through two more object leaves.** 0.8.0 fixed `media`, which was classified as a single `public` leaf so the author's object was returned by reference without recursing. The same shape survived in two more places:

- **`rubric`.** A grader's `modelAnswer` or `aiModel` parked on the rubric reached the exam client and `assertRedacted` blessed it. The rubric stays learner-visible — it tells a learner what they are graded on — but that now means its *documented* fields are visible (`label`, and each criterion's `name`, `description`, `weight`), not anything anyone stashes under it.
- **`feedback` and each blank's `match`.** These are `answer-key`, so the default `reveal: 'none'` drops them entirely and the flaw is invisible there. `reveal: 'after-submit'` keeps them, and kept them **whole**: a grader's private note or tuning knob parked beside the documented fields went to the learner along with the answer key, and the projection aliased the caller's object. An after-submit reveal now shows `correct` / `incorrect` and the documented `TextMatchPolicy` keys, and nothing else.

A nested projection that keeps no fields is now omitted rather than emitted as `{}`, so giving an all-`answer-key` object a nested policy does not turn its absence into an empty object. Verified against the published 0.7.1 build: well-formed content redacts byte-identically in **both** reveal modes, so the only behaviour change is that undocumented sidecars stop travelling.

**A budgeted recording never bound on a written-response slot.** An essay carrying a recording with `maxPlays` rendered an **unlimited** player — no plays-remaining, nothing counted — which on a listening-and-writing paper is exactly the failure the budget exists to prevent. `<WrittenResponse>` was the one branch of the pager whose props were written out by hand rather than spread, and it had been the branch left behind three separate times: `defaultSubmitted`, the redacted-in-`practice` guard, and the media budget. It now derives its props by subtracting `onComplete` from the same bag the other types receive, so a prop added to that bag cannot be forgotten there again.

**And the guard meant to catch that could never fire.** `ActivityMedia`'s "budget declared with no binding" throw sat *after* the early return for `controls: 'minimal'` — which a budgeted policy always resolves to — so it was dead code for the one case it was written for. Moved ahead of the branch, and given the standalone test that the pager can never provide: `ActivitySequence` throws on a missing `onPlayConsumed` before children mount, and once that callback is supplied it passes a binding, so no pager test reaches this path either way.

**Three guards that could not fail.** Found by mutation-testing the suite — breaking each mechanism and checking whether any test noticed:

- The last-play confirmation gate had **no coverage at all**, and was silently absorbing the press in two neighbouring resume tests: both used `maxPlays: 2` with one play spent, so the press they made was swallowed by the gate and their assertions held whether playback resumed or a dialog opened. Gutting resume detection left the whole file green. Both now use a budget that clears the gate and assert that playback actually resumed.
- Partial multiple-choice scoring asserted only that a score with an off-paper option id lands in `[0, 1]` — which holds whether that id is ignored, credited, or treated as wrong. Now pinned to exact values, one of which is only reachable by the correct treatment.
- The empty-input fuzzy guard was probed with three spaces against a one-character answer, which the length-difference early exit refuses before the guard is ever consulted. A single space now probes the guard itself.

Also: `classifyBand`'s float tolerance was pinned only to within `[0, 0.01)` — seven orders of magnitude of slack, all of it in the promoting direction the function exists to prevent — and is now straddled at its real epsilon; and the cross-type resume test gained its `written-response` row, asserting the restored draft survives rather than only that the control is locked.
