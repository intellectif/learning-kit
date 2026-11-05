---
'@intellectif/lk-react': patch
---

**`<InteractiveVideo>`: hydrates server-rendered HTML without a mismatch, and resumes when the video's metadata loaded before the player mounted**

**Action required:** none. A host that loaded the player in the browser only, or replayed `loadedmetadata` itself, to get around either problem can drop that workaround.

- **Hydration:** a server-rendered player no longer fails to hydrate. Its element ids came from a counter that counted once on the server and again in the browser, and the picture-in-picture button was decided during render, where the server cannot know. Ids now come from `useId`, and the server renders no picture-in-picture button; hydration adds it where the browser supports it.
- **Resume and length:** when the file is cached, the browser can load its metadata before React commits the player (a slow render) or before hydration attaches its handlers. React drops a `loadedmetadata` that fires then, so the learner started at 0:00 with no length shown, whatever `progress` said. On mount, the player now reads an element that already has its metadata. A new load, such as **Try again**, reads it again; a late event for the same load does not.
