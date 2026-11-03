---
'@intellectif/lk-core': minor
---

**An interactive video can hold a spoken answer: `speaking-response` joins `INTERACTIVE_VIDEO_ITEM_TYPES`**

**Action required:** only for a `switch` or a `Record` that is exhaustive over `InteractiveVideoItemType`: it needs a `'speaking-response'` entry. A list built from `INTERACTIVE_VIDEO_ITEM_TYPES` follows by itself.

- **`validateItemGroup`, `validateItemGroupDraft` and `isInteractiveVideoItemType`** accept a spoken answer in a timeline group; `ig_timeline_item_type` still names a written response. Its own picture or recording is allowed under its own playback policy, as on any other item.
- **`redactItemGroup` and `assertRedactedItemGroup`** project it as a loose spoken answer is projected: its rubric, `measure` included, stays public.
- **`composeTimelineScore`** keeps the video `provisional` while a spoken answer waits for its grade, graded later or held for a person by `routeGrade`, and never counts it as zero. The behaviour is unchanged; three scoring vectors now pin it.
- **The validation corpus** gains interactive videos: one holding a spoken answer, with every variant, and one holding a written response, which stays refused. No existing expectation changed.
- **Why a minor:** additive. A video that was refused for holding a spoken answer is now accepted; nothing accepted before is refused, and no grade changes.
