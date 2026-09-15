---
'@intellectif/lk-react': patch
---

`<ActivitySequence>`'s missing-`shuffleSeed` error now names every shuffle that raises it.

In `exam` and `review` mode the sequence throws at render when something shuffles and no `shuffleSeed` was passed. The guard counts an activity's own shuffle — `MultipleChoiceData.shuffle` and `GapSelectData.shuffleChoices`, including an item inside a group — but the message listed only `shuffle="entries"` and a group with `shuffle: "within-group"`. A sequence whose only shuffle was an item's own field was sent looking for settings it did not have. The message now names `data.shuffle` and `data.shuffleChoices` as well.

It also no longer says that `flattenSequence(entries, { seed })` reproduces the order the learner saw. That holds for entry and group-item order, but an item deals its own options from the same seed rather than through `flattenSequence`, so the message now promises the seed instead of naming a function.

Only the wording changed: the same sequences throw, in the same modes, and the message still contains ``requires a `shuffleSeed` ``. A test asserting on the old list of causes needs updating.
