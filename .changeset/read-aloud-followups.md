---
'@intellectif/lk-react': minor
---

Play-budget and read-aloud fixes, and a way to record under a strict Content-Security-Policy.

- **A refused start no longer earns a free play.** A budgeted recording whose start the player refused — its plays spent, or the player held still while a read-aloud take is recorded — was paused inside its own `play` event, and that pause was kept as a place to resume from. The next press then resumed a play nobody had paid for: on a spent budget, a media key followed by the Play button played the recording once more. A pause is now a place to resume from only when the play it stops was one the player let run. This affects every component with a play-limited recording, not only read-aloud.
- **A model recording pressed during a take spends no play.** While a read-aloud take is being recorded, the model recordings are held still, and a press, a media key or a last-play confirmation left open is refused before it is charged. Once the take is over, a press is a play again, charged once.
- **`workletUrl` on `<ReadAloud>` and `<ActivitySequence>`.** A Content-Security-Policy whose `script-src` does not allow `blob:` blocks the recorder's audio processor. Host a copy of `CAPTURE_PROCESSOR_SOURCE` yourself and pass its URL; the sequence forwards it to every read-aloud slot. Like `recordingBinding`, it does not reach a `renderers` override.
- **Take playback the page refuses is said, not silent.** When the learner's own take cannot be played back — most often a policy whose `media-src` does not allow `blob:` — a note replaces the player and the buttons that play one word of it, instead of controls that do nothing when pressed. One new string, `readAloudPlaybackUnavailable`, brings the total to 115.
- **An item's recording bounds are read in one place.** Practice renders unvalidated content in production, so a `recording` a server stored may hold anything. Every bound the recorder captures under, and every sentence that names one, now comes from one reading that always yields bounds the schema accepts: an unreadable present bound becomes the schema's own ceiling, never no bound at all.
