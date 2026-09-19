---
'@intellectif/lk-core': patch
---

`validateXAPIStatement` now recognises a production browser build. In production it is meant to log a malformed statement and send it anyway, and to throw only in development. It read `NODE_ENV` in a way no bundler replaces, and a browser has no `process` to read at run time, so in every production browser app it took the development path and threw — a malformed statement brought down the activity that built it rather than being logged. It now reads the literal `process.env.NODE_ENV` your bundler substitutes. Node, where `process` exists, behaves as before, and no grade changes.
