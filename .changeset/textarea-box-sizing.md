---
'@intellectif/lk-react': patch
---

**Written response fits its column**: the answer box no longer runs past the form's edge on a page without a `box-sizing` reset.

**Action required:** none. Only the skin changes: no markup, prop or string. A page with a global `* { box-sizing: border-box }` reset sees no change.

- `.lk-wr-textarea` is `width: 100%` with padding and a border, and nothing made it `border-box`, so the padding and border sat outside the 100%: in a 680 px form the box measured 714 px. It is now `box-sizing: border-box`, as the answer fields of the other activity components already were.
- Media in a `<WrittenResponse>`, a `<GapSelect>` or a `<StimulusPanel>` ran 2 px past its frame the same way: every embedded player, and an image or video wider than the column. `.lk-media-el` is now `border-box` too; media in the other components already was.
- An end-to-end test measures both in a browser, the answer box in light and in dark.
