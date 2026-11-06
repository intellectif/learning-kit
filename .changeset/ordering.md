---
'@intellectif/lk-core': minor
'@intellectif/lk-react': minor
---

**Ordering: the learner puts items in order — the sentences of a paragraph, the steps of a process, the events of a story — with `<Ordering>` to draw it**

**Action required:** none for content and grades. Install lk-core 1.15.0 with lk-react 23.12.0. **No grade changes:** every stored grade and validation result replays as before. Type-level additions: `ordering` joins `BUILT_IN_ACTIVITY_TYPES` and `INTERACTIVE_VIDEO_ITEM_TYPES`, and `RedactedOrderingData` joins `RedactedActivity`, so a `switch` or `Record` exhaustive over one of them needs an entry. A host that registered its own `ordering` type must rename it.

- **lk-core:** the `ordering` activity type — `OrderingData` with 2 to 30 `items`, written in their right order, and a response that lists item ids first to last (`order`). An item is right when it follows the item it should, or is rightly first: a sequence right but for one item moved to the front loses two items, not every one after it. `orderingStart` gives the order items start in, the same in every runtime and with nothing already in place, so an untouched answer scores 0; `redact()` lists a learner's copy in that order, never as authored, and drops each item's feedback. Draft checks under `or_*` codes, three critic findings (`or_ids_reveal_order` warns when ids count up in the right order), the xAPI `sequencing` interaction, and frozen grade and validation vectors. A video quiz may hold one.
- **lk-react:** `<Ordering>` (also `@intellectif/lk-react/components/Ordering`): a numbered list with a Move up and a Move down button on each item, so no dragging is needed, and every move read out. After a check each item is marked in or out of order, in words as well as colour, and the right order is shown where the delivery policy shows answers. `<ActivitySequence>`, `<ActivityPreview>` and `<InteractiveVideo>` draw it. New strings: `orderListLabel`, `orderMoveUp`, `orderMoveDown`, `orderMoved`, `orderInOrder`, `orderOutOfOrder`, `orderSolution`. New class hooks: `.lk-or` and its parts. See https://github.com/intellectif/learning-kit/blob/main/docs/authoring.md#ordering--put-items-in-their-order-115
- Not yet: AI explanations, hints, drafts and variants for an ordering item.
