---
'@intellectif/lk-core': patch
---

`validateItemGroupDraft` no longer reports a registered item type as unknown when that type's own checks throw.

Every item in a group is checked by `validateDraft` for its own type. Any error thrown on the way was caught and reported as `ig_item_type_unknown` — `"<type>" is not a registered activity type.` — a code documented for a type nobody registered. So a registered type whose `checkDraft` threw for some other reason, such as a bug in the check or input that took it past a limit like a regular expression too large to compile, was reported as unknown; so was one whose schema threw, whenever the group around it failed its own schema — a missing stimulus, say, or two questions sharing an id. An editor showed the author a problem the draft did not have, and the real error was hidden.

Now only an `UnknownActivityTypeError` for the item's own type is reported. Any other error is thrown from `validateItemGroupDraft`, whatever state the rest of the group is in, as `validateDraft` already throws it for the same item on its own. (`validateItemGroup` throws a schema's error too, but only once the group around the item passes its own schema.) An unregistered type is reported exactly as before, with the same code, severity, path and message, and every other item's problems are still listed.

A group made only of built-in types behaves as before: their checks are property-tested not to throw on any input. If you register your own types, a `checkDraft` that throws now surfaces as an error where you call `validateItemGroupDraft`. `checkDraft` must not throw on a plain object, so the fix belongs in the check.
