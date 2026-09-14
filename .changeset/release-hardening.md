---
'@intellectif/lk-core': minor
'@intellectif/lk-react': minor
---

Node 22 is the floor, and the published `engines` says so.

Both packages declared `engines: { node: '>=20' }` while CI stopped testing Node 20 in `e17f5fa` (pnpm 11 compatibility) and Node 20 itself reached end of life in April 2026. A support claim nothing verifies is worse than a narrow one: it invites an install onto a runtime no test has touched for months. The floor is now `>=22`, which is what CI has actually been proving all along — Node 22 (the LTS most consumers run) and Node 24 (the Node the Release job builds the published tarball on).

If you are still on Node 20, this is the release to stop at; nothing here changes behaviour on a supported runtime.
