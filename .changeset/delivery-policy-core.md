---
'@intellectif/lk-core': minor
---

Delivery policies: what a school lets a learner see around a question — feedback, solutions, hints
and AI help — decided per paper rather than per item, so one question serves a practice lesson and a
final exam without being authored twice.

- **`DeliveryPolicy`** — `{ feedback?, solutions?, hints?, ai?: { hints?, explanations? } }`, with
  `ai: false` as shorthand for both AI settings off. Every setting is a restriction that defaults to
  `true`, so an empty policy is exactly the behaviour before policies existed; nothing can be switched
  on.
- **`resolveDeliveryPolicy(policy)`** spells a policy out, every setting a boolean. It never throws:
  `null` is unset, and any other value that is not exactly `true` restricts — a `"false"` from a form
  means off, not on.
- **`validateDeliveryPolicy(policy)`** checks a policy before it is stored and names each problem at
  its path, a misspelled setting included.
- **`combineDeliveryPolicies(...policies)`** keeps a setting on only where every policy leaves it on.
- **`OPEN_DELIVERY_POLICY`**, the policy that restricts nothing.
- **`planAttempt(entries, { delivery })`** records the policy the attempt is sat under as
  `plan.delivery`, spelled out, and includes it in `planHash`. It throws on a policy that would not
  validate. **A plan made without one is byte-identical to before, `planHash` included.**
- **`verifyAttemptPlan`** reports `deliveryChanged: true` when two plans were made under different
  policies, and `matches` is then `false`. The field is present only when true, so every drift report
  between plans without a policy keeps exactly its old shape.

No grade changes: nothing here reaches a scorer. Hint penalties, `ItemScoringPolicy` and retries —
which do — come next, with grade vectors.

See `docs/delivery.md`.
