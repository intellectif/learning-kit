---
"@intellectif/lk-react": patch
---

**`<InteractiveVideo>` stops at its quizzes in Firefox**: one frame that threw no longer ends the playhead loop, which let the video play through every quiz after it.

**Action required:** none.

The player follows the playhead once per animation frame and asked for the next frame only after the current one's work. In Firefox, `window.event` can briefly hold an event the page is not allowed to read (seen while Firefox's Picture-in-Picture support registered the video), and React throws "Permission denied to access property "type"" reading it while scheduling an update. A single frame threw and none followed: no quiz after that point opened, a required quiz included, and progress stopped being reported during playback. The next frame is now requested first, so a frame that throws is skipped and the following one carries on from where playback is.
