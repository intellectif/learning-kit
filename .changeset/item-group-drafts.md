---
'@intellectif/lk-core': minor
---

Testlets get a draft contract of their own.

The authoring slice landed in 0.9.0 and every activity type has it, but the container that holds a reading passage and its six questions did not — so an editor could tell an unfinished question from a broken one and had nothing to say about the group itself.

`validateItemGroupDraft(draft)` and `createItemGroupDraft({ newId })` are a **separate pair** rather than an `'item-group'` activity type, because `validateDraft('item-group', …)` throws on purpose: `item-group` is reserved in the registry so it can never be registered as an activity, and that is exactly what lets `isItemGroup` and `flattenSequence` trust their own container. Widening `validateDraft` to accept it would have meant weakening the guard.

Each item is checked by `validateDraft` **for its own type** and its issues are re-pathed under `items.N.…`, so a multiple-choice question inside a testlet reports the same codes a standalone one does and one translation table covers both. An item whose type nobody registered is reported, never thrown — an author fixing a six-item group wants all six problems, not the first one that blew up. The group is `complete` only when the container passes, every item passes its own schema, and every item is itself `complete`.

Fifteen new codes (`ig_*`), all documented in the authoring guide with their severities and paths; the stimulus's media reports under the codes media already uses. A new group starts as a `text` stimulus with an empty body and no items — `text` is the only kind that needs no uploaded file to be a valid draft.
