/**
 * Layout and components of both players, scoped by Stage so independently
 * themed players can coexist. Sizes are in `em` of the stage's base size: 30px
 * on the scaled 1920×1080 landscape stage (read from the back of a classroom or
 * a shared screen), 17px when the layout stacks on a phone.
 */
export const PLAYER_CSS = `
[data-lkia-root] { position:relative; isolation:isolate; overflow:hidden; overflow:clip; box-sizing:border-box; outline:none; }
[data-lkia-root] *, [data-lkia-root] *::before, [data-lkia-root] *::after { box-sizing:border-box; }
[data-lkia-root] [data-lkia-stage] { position:relative; display:flex; flex-direction:column; gap:28px; padding:52px 64px; font-size:30px; overflow:auto; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-stage] { padding:16px; gap:16px; font-size:17px; }
[data-lkia-root] h1, [data-lkia-root] h2, [data-lkia-root] h3, [data-lkia-root] p, [data-lkia-root] ul, [data-lkia-root] ol, [data-lkia-root] dl, [data-lkia-root] figure { margin:0; }
[data-lkia-root] video, [data-lkia-root] img { display:block; max-width:100%; }
[data-lkia-root] [data-lkia-icon] { flex:none; width:1em; height:1em; }

/* Controls: flat fills, fully round, one accent for the action that moves the activity on. */
[data-lkia-root] button { font:inherit; font-weight:600; line-height:1.1; color:var(--lkia-ink-1); background:var(--lkia-panel); border:0; border-radius:var(--lkia-radius-button); padding:.6em 1.15em; min-height:2.2em; display:inline-flex; align-items:center; justify-content:center; gap:.45em; cursor:pointer; -webkit-tap-highlight-color:transparent; }
[data-lkia-root] button:hover { background:var(--lkia-surface-strong); }
[data-lkia-root] [data-lkia-primary] { background:var(--lkia-accent); color:var(--lkia-on-accent); padding-inline:1.5em; }
[data-lkia-root] [data-lkia-panel] button:not([data-lkia-primary]) { background:var(--lkia-surface-strong); }
[data-lkia-root] [data-has-backdrop="true"] [data-lkia-panel] button:not([data-lkia-primary]) { background:var(--lkia-bg); }
[data-lkia-root] [data-lkia-panel] button:not([data-lkia-primary]):hover { background:color-mix(in srgb, var(--lkia-surface-strong) 80%, var(--lkia-ink-1)); }
[data-lkia-root] [data-lkia-primary]:hover { background:color-mix(in srgb, var(--lkia-accent) 86%, var(--lkia-ink-1)); }
[data-lkia-root] [aria-disabled="true"] { opacity:.5; cursor:not-allowed; }
[data-lkia-root] [aria-disabled="true"]:hover { transform:none; }
[data-lkia-root] :focus-visible { outline:4px solid var(--lkia-accent); outline-offset:3px; }

/* Bar: way back, where you are, and the glossary. */
[data-lkia-root] [data-lkia-bar] { display:flex; align-items:center; gap:24px; min-height:2.2em; flex:none; }
[data-lkia-root] [data-lkia-bar] h1:not([data-lkia-eyebrow]) { font-size:2.15em; }
[data-lkia-root] [data-lkia-heading] { display:flex; flex-direction:column; gap:10px; }
[data-lkia-root] [data-lkia-lede] { font-size:1em; color:var(--lkia-ink-2); max-width:60ch; }
[data-lkia-root] [data-lkia-bar] [data-lkia-eyebrow] { display:flex; align-items:baseline; gap:.35em; min-width:0; font-family:var(--lkia-font-body); font-size:.8em; font-weight:500; letter-spacing:0; line-height:1.3; color:var(--lkia-ink-2); text-transform:none; outline:none; }
[data-lkia-root] [data-lkia-eyebrow-title] { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[data-lkia-root] [data-lkia-eyebrow-count] { flex:none; white-space:nowrap; }
[data-lkia-root]:has([data-has-backdrop="true"]) [data-lkia-eyebrow] { background:var(--lkia-frost); color:var(--lkia-ink-1); padding:.3em .8em; border-radius:999px; }
[data-lkia-root] [data-lkia-bar-tools] { margin-inline-start:auto; display:flex; flex-wrap:wrap; gap:12px; }
[data-lkia-root] [data-lkia-content] { display:contents; }
/* The one status region: read by screen readers, never seen. */
[data-lkia-root] [data-lkia-status] { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); clip-path:inset(50%); white-space:nowrap; border:0; }
[data-lkia-root] [data-lkia-focus]:focus:not(:focus-visible) { outline:none; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-bar] { flex-wrap:wrap; gap:10px 14px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-bar] h1:not([data-lkia-eyebrow]) { font-size:1.7em; }

/* What Happens — the board. Cards carry a real frame of their clip. */
[data-lkia-root] [data-lkia-board] { list-style:none; padding:0; display:grid; grid-template-columns:repeat(var(--lkia-cols, 4), minmax(0, 1fr)); gap:28px; align-content:center; flex:1; min-height:0; }
[data-lkia-root] [data-lkia-board][data-count="1"] { max-width:780px; }
[data-lkia-root] [data-lkia-board][data-count="1"], [data-lkia-root] [data-lkia-board][data-count="2"], [data-lkia-root] [data-lkia-board][data-count="3"] { --lkia-thumb-ratio:4 / 3; }
[data-lkia-root] [data-lkia-board][data-count="2"] [data-lkia-card-title], [data-lkia-root] [data-lkia-board][data-count="3"] [data-lkia-card-title], [data-lkia-root] [data-lkia-board][data-count="1"] [data-lkia-card-title] { font-size:1.05em; }
[data-lkia-root] [data-lkia-card] { position:relative; width:100%; height:100%; padding:0; display:flex; flex-direction:column; align-items:stretch; justify-content:flex-start; gap:0; text-align:start; border-radius:var(--lkia-radius-panel); overflow:hidden; background:var(--lkia-panel); }
[data-lkia-root] [data-lkia-thumb] { position:relative; display:block; aspect-ratio:var(--lkia-thumb-ratio, 16 / 10); background:var(--lkia-surface-strong); overflow:hidden; }
[data-lkia-root] [data-lkia-thumb] img, [data-lkia-root] [data-lkia-thumb] video { width:100%; height:100%; object-fit:cover; transition:transform var(--lkia-duration-slow) var(--lkia-easing); }
[data-lkia-root] [data-lkia-card]:hover [data-lkia-thumb] img, [data-lkia-root] [data-lkia-card]:hover [data-lkia-thumb] video { transform:scale(1.05); }
[data-lkia-root] [data-lkia-card-title] { display:block; padding:.7em .85em .85em; font-size:.92em; font-weight:600; line-height:1.2; }
[data-lkia-root] [data-lkia-done] { position:absolute; top:14px; inset-inline-start:14px; display:inline-flex; align-items:center; gap:.35em; padding:.3em .75em; border-radius:999px; background:var(--lkia-accent); color:var(--lkia-on-accent); font-size:.62em; font-weight:700; }
[data-lkia-root] [data-lkia-card][data-completed="true"] [data-lkia-thumb] { opacity:.72; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-board] { grid-template-columns:repeat(min(var(--lkia-cols, 2), 2), minmax(0, 1fr)); gap:12px; --lkia-thumb-ratio:16 / 10; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-card-title] { font-size:.9em; }

/* What Happens — watching: the clip, and the panel that speaks to the class. */
[data-lkia-root] [data-lkia-watch] { display:grid; grid-template-columns:minmax(0, 1.5fr) minmax(0, 1fr); gap:48px; align-items:center; flex:1; min-height:0; transition:grid-template-columns var(--lkia-duration-slow) var(--lkia-easing); }
[data-lkia-root][data-stage="tell"] [data-lkia-watch], [data-lkia-root][data-stage="answer"] [data-lkia-watch] { grid-template-columns:minmax(0, .85fr) minmax(0, 1.15fr); }
[data-lkia-root] [data-lkia-watch][data-aspect="9:16"] { grid-template-columns:auto minmax(0, 1fr); }
[data-lkia-root] [data-lkia-frame] { position:relative; min-width:0; display:grid; place-items:center; }
[data-lkia-root] [data-lkia-frame] video { width:100%; max-height:860px; border-radius:var(--lkia-radius-video); object-fit:contain; }
[data-lkia-root] [data-lkia-watch][data-aspect="9:16"] [data-lkia-frame] video { width:auto; height:860px; max-height:860px; transition:height var(--lkia-duration-slow) var(--lkia-easing); }
[data-lkia-root][data-stage="tell"] [data-lkia-watch][data-aspect="9:16"] [data-lkia-frame] video, [data-lkia-root][data-stage="answer"] [data-lkia-watch][data-aspect="9:16"] [data-lkia-frame] video { height:640px; }
[data-lkia-root] [data-lkia-play] { position:absolute; inset:auto; font-size:1.2em; background:var(--lkia-accent); color:var(--lkia-on-accent); box-shadow:var(--lkia-shadow-md); } /* taste-skill-ignore: the play button floats over a blocked video */
[data-lkia-root] [data-lkia-backdrop], [data-lkia-root] [data-lkia-veil] { position:absolute; inset:0; background-size:cover; background-position:center; pointer-events:none; z-index:-2; }
[data-lkia-root] [data-lkia-veil] { z-index:-1; }
[data-lkia-root] [data-lkia-panel] { background:var(--lkia-panel); border-radius:var(--lkia-radius-panel); padding:44px 48px; display:flex; flex-direction:column; gap:26px; min-width:0; }
[data-lkia-root] [data-lkia-panel]:empty { display:none; }
[data-lkia-root] [data-lkia-panel] h2 { font-size:1.9em; }
[data-lkia-root] [data-lkia-watching] { display:flex; flex-direction:column; gap:22px; }
[data-lkia-root] [data-lkia-panel] [data-lkia-hint] { font-family:var(--lkia-font-body); font-size:1.1em; font-weight:600; letter-spacing:0; outline:none; }
[data-lkia-root] [data-lkia-progress] { display:block; height:12px; border-radius:999px; background:var(--lkia-surface-strong); overflow:hidden; }
[data-lkia-root] [data-lkia-progress]::before { content:""; display:block; height:100%; width:100%; border-radius:inherit; background:var(--lkia-accent); transform-origin:left center; transform:scaleX(var(--lkia-progress, 0)); transition:transform var(--lkia-duration) linear; }
/* "To help you": hidden until the teacher opens it. The panel grows to make room, the
   chevron turns, and the phrases spring in one after another; closing folds them away. */
[data-lkia-root] [data-lkia-supports] { display:flex; flex-direction:column; align-items:flex-start; }
[data-lkia-root] [data-lkia-panel] [data-lkia-help-toggle] { font-size:.95em; gap:.5em; padding-inline:.9em 1em; }
[data-lkia-root] [data-lkia-panel] [data-lkia-supports][data-open="true"] [data-lkia-help-toggle] { background:var(--lkia-accent-soft); color:var(--lkia-ink-1); }
[data-lkia-root] [data-lkia-help-toggle] [data-lkia-icon] { color:var(--lkia-accent); }
[data-lkia-root] [data-lkia-chevron] { display:inline-flex; transition:transform var(--lkia-duration) var(--lkia-easing); }
[data-lkia-root] [data-lkia-supports][data-open="true"] [data-lkia-chevron] { transform:rotate(180deg); }
[data-lkia-root] [data-lkia-supports-body] { display:grid; grid-template-rows:0fr; width:100%; opacity:0; visibility:hidden; transition:grid-template-rows var(--lkia-duration-slow) var(--lkia-easing), opacity var(--lkia-duration) var(--lkia-easing), visibility 0s linear var(--lkia-duration-slow); }
[data-lkia-root] [data-lkia-supports][data-open="true"] [data-lkia-supports-body] { grid-template-rows:1fr; opacity:1; visibility:visible; transition:grid-template-rows var(--lkia-duration-slow) var(--lkia-easing), opacity var(--lkia-duration-fast) var(--lkia-easing), visibility 0s; }
[data-lkia-root] [data-lkia-supports] ul { min-height:0; overflow:hidden; list-style:none; margin:0; padding:18px 4px 6px; display:flex; flex-wrap:wrap; gap:12px; }
[data-lkia-root] [data-lkia-supports] li { background:var(--lkia-surface-strong); border-radius:999px; padding:.35em .85em; font-size:.92em; opacity:0; transform:translateY(18px) scale(.86); transform-origin:left center; transition:transform var(--lkia-duration-fast) var(--lkia-easing), opacity var(--lkia-duration-fast) var(--lkia-easing); }
[data-lkia-root] [data-lkia-supports][data-open="true"] li { opacity:1; transform:none; transition:transform var(--lkia-duration-slow) cubic-bezier(.34, 1.56, .64, 1), opacity var(--lkia-duration) var(--lkia-easing); transition-delay:calc(90ms + var(--i, 0) * var(--lkia-stagger)); }
[data-lkia-root] [data-has-backdrop="true"] [data-lkia-supports] li { background:var(--lkia-bg); }
[data-lkia-root] [data-animate="answer-fade-up"] { display:flex; flex-direction:column; gap:22px; }
[data-lkia-root] [data-animate="answer-fade-up"] > h2 { font-size:.8em; font-family:var(--lkia-font-body); font-weight:600; color:var(--lkia-ink-2); letter-spacing:0; }
[data-lkia-root] [data-lkia-answer] { font-family:var(--lkia-font-heading); font-size:1.65em; font-weight:600; line-height:1.3; letter-spacing:-0.01em; max-width:30ch; }
[data-lkia-root] [data-lkia-underline] { background:var(--lkia-accent-soft); color:inherit; border-radius:.2em; padding:0 .08em; text-decoration:underline; text-decoration-color:var(--lkia-accent); text-decoration-thickness:.12em; text-underline-offset:.18em; }
[data-lkia-root] [data-lkia-actions] { display:flex; flex-wrap:wrap; gap:16px; align-items:center; }
[data-lkia-root] [data-lkia-error] { color:var(--lkia-negative); font-weight:700; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-watch], [data-lkia-root][data-lkia-layout="portrait"][data-stage] [data-lkia-watch] { grid-template-columns:minmax(0, 1fr); gap:16px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-frame] video { max-height:56vh; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-watch][data-aspect="9:16"] [data-lkia-frame] video, [data-lkia-root][data-lkia-layout="portrait"][data-stage] [data-lkia-watch][data-aspect="9:16"] [data-lkia-frame] video { height:56vh; max-height:56vh; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-panel] { padding:20px; gap:16px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-panel] h2 { font-size:1.45em; }

/* Cine-Scramble — the title card. */
[data-lkia-root][data-lkia-template="cine-scramble"] h1:not([data-lkia-eyebrow]) { font-size:4.4em; text-transform:uppercase; letter-spacing:0; line-height:.9; }
[data-lkia-root][data-lkia-template="cine-scramble"][data-stage="start"] [data-lkia-bar] { justify-content:flex-end; }
[data-lkia-root] [data-lkia-start] { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0, 1fr); gap:56px; align-items:center; }
[data-lkia-root] [data-lkia-start]:has([data-lkia-poster]) { grid-template-columns:minmax(0, 1.25fr) minmax(0, 1fr); }
[data-lkia-root] [data-lkia-poster] { order:2; width:100%; max-height:800px; aspect-ratio:4 / 3; object-fit:cover; border-radius:var(--lkia-radius-video); }
[data-lkia-root] [data-lkia-start-body] { display:flex; flex-direction:column; align-items:flex-start; gap:32px; }
[data-lkia-root] [data-lkia-tagline] { font-size:1.3em; line-height:1.3; max-width:30ch; color:var(--lkia-ink-2); }
[data-lkia-root] [data-lkia-start-body] > [data-lkia-primary] { font-size:1.2em; }
[data-lkia-root] [data-lkia-scenes] { list-style:none; padding:0; display:flex; flex-direction:column; gap:12px; width:min(100%, 900px); }
[data-lkia-root] [data-lkia-scene] { width:100%; justify-content:flex-start; gap:.8em; border-radius:var(--lkia-radius-panel); padding:.55em .9em; font-size:1.05em; text-align:start; }
[data-lkia-root] [data-lkia-scene] [data-lkia-done] { position:static; margin-inline-start:auto; }
[data-lkia-root] [data-lkia-chip] { display:inline-grid; place-items:center; min-width:1.7em; height:1.7em; padding:0 .4em; border-radius:999px; background:var(--lkia-accent); color:var(--lkia-on-accent); font-weight:700; font-size:.8em; font-variant-numeric:tabular-nums; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-start] { grid-template-columns:minmax(0, 1fr); gap:20px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-poster] { order:0; max-height:40vh; }
[data-lkia-root][data-lkia-layout="portrait"][data-lkia-template="cine-scramble"] h1:not([data-lkia-eyebrow]) { font-size:3em; }

/* Cine-Scramble — arranging: the timeline above, its captions under each slot, the clips below. */
[data-lkia-root] [data-lkia-arrange] { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0, 1fr) auto; grid-template-areas:"help help" "timeline timeline" "pool pool" "announce actions"; align-content:start; gap:22px 24px; }
[data-lkia-root] [data-lkia-help] { grid-area:help; font-size:.66em; color:var(--lkia-ink-2); max-width:110ch; }
[data-lkia-root] [data-lkia-timeline] { grid-area:timeline; list-style:none; margin:0; padding:22px; background:var(--lkia-panel); border-radius:var(--lkia-radius-panel); display:grid; grid-template-columns:repeat(var(--lkia-clip-count), minmax(0, 400px)); justify-content:center; gap:20px; }
[data-lkia-root] [data-lkia-slot] { display:flex; flex-direction:column; gap:10px; min-width:0; }
[data-lkia-root] [data-lkia-dropzone] { position:relative; aspect-ratio:16 / 9; border-radius:var(--lkia-radius-video); background:var(--lkia-surface-strong); transition:background-color var(--lkia-duration-fast) var(--lkia-easing), outline-color var(--lkia-duration-fast) var(--lkia-easing); outline:4px solid transparent; outline-offset:3px; }
[data-lkia-root] [data-lkia-drop] { width:100%; height:100%; border-radius:inherit; background:transparent; border:3px dashed var(--lkia-line); color:var(--lkia-ink-3); font-size:.6em; font-weight:600; padding:1.6em .8em .8em; }
[data-lkia-root] [data-has-selection="true"] [data-lkia-drop] { border-color:var(--lkia-accent); color:var(--lkia-ink-1); }
[data-lkia-root] [data-lkia-drop]:hover { background:var(--lkia-accent-soft); border-color:var(--lkia-accent); color:var(--lkia-ink-1); }
[data-lkia-root] [data-lkia-dropzone] > [data-lkia-clip] { position:absolute; inset:0; aspect-ratio:auto; outline-offset:-4px; }
[data-lkia-root] [data-lkia-slot-number] { position:absolute; top:10px; inset-inline-start:10px; z-index:2; display:grid; place-items:center; min-width:1.7em; height:1.7em; border-radius:6px; background:var(--lkia-bg); color:var(--lkia-ink-1); font-size:.62em; font-weight:700; font-variant-numeric:tabular-nums; pointer-events:none; }
[data-lkia-root] [data-lkia-slot][data-drop-target="true"] [data-lkia-dropzone] { background:var(--lkia-accent-soft); outline-color:var(--lkia-accent); }
[data-lkia-root] [data-lkia-slot][data-slot-result="correct"] [data-lkia-dropzone] { outline-color:var(--lkia-positive); }
[data-lkia-root] [data-lkia-slot][data-slot-result="incorrect"] [data-lkia-dropzone] { outline-color:var(--lkia-negative); }
[data-lkia-root] [data-lkia-slot] [data-lkia-hint] { font-size:.68em; line-height:1.32; }
[data-lkia-root] [data-lkia-result] { display:inline-flex; align-items:center; gap:.35em; font-size:.62em; font-weight:700; }
[data-lkia-root] [data-slot-result="correct"] [data-lkia-result] { color:var(--lkia-positive); }
[data-lkia-root] [data-slot-result="incorrect"] [data-lkia-result] { color:var(--lkia-negative); }
[data-lkia-root] [data-lkia-pool] { grid-area:pool; display:grid; grid-template-columns:repeat(var(--lkia-clip-count), minmax(0, 400px)); justify-content:center; gap:20px; padding:16px 22px; border-radius:var(--lkia-radius-panel); transition:background-color var(--lkia-duration-fast) var(--lkia-easing); }
[data-lkia-root] [data-lkia-pool][data-drop-target="true"] { background:var(--lkia-accent-soft); }
[data-lkia-root] [data-lkia-pool-gap] { aspect-ratio:16 / 9; border-radius:var(--lkia-radius-video); background:var(--lkia-panel); opacity:.6; }
[data-lkia-root] [data-lkia-announce] { grid-area:announce; align-self:center; font-size:.7em; font-weight:600; color:var(--lkia-ink-2); min-height:1.4em; }
[data-lkia-root] [data-lkia-arrange] > [data-lkia-actions] { grid-area:actions; }
[data-lkia-root] [data-lkia-check] { font-size:1.05em; }

/* A clip: its loop fills the frame; its name and the way back sit on it. */
[data-lkia-root] [data-lkia-clip] { position:relative; aspect-ratio:16 / 9; border-radius:var(--lkia-radius-video); overflow:hidden; background:#000; cursor:grab; touch-action:none; user-select:none; -webkit-user-select:none; transition:outline-color var(--lkia-duration-fast) var(--lkia-easing), scale var(--lkia-duration-fast) var(--lkia-easing), opacity var(--lkia-duration) var(--lkia-easing), filter var(--lkia-duration) var(--lkia-easing); outline:4px solid transparent; outline-offset:3px; }
[data-lkia-root] [data-lkia-clip]:not([data-entered]):not([data-flip]) { animation:lkia-panel-fade var(--lkia-duration) var(--lkia-easing) both; }
[data-lkia-root] [data-lkia-clip]:hover { scale:1.03; }
[data-lkia-root] [data-lkia-clip]:active { scale:.97; }
[data-lkia-root] [data-lkia-clip][data-selected="true"] { outline-color:var(--lkia-accent); scale:1.03; }
[data-lkia-root] [data-lkia-grip] { position:absolute; top:10px; inset-inline-end:10px; z-index:2; display:grid; place-items:center; width:1.9em; height:1.9em; border-radius:999px; background:var(--lkia-bg); color:var(--lkia-ink-1); font-size:.55em; opacity:0; scale:.7; transition:opacity var(--lkia-duration-fast) var(--lkia-easing), scale var(--lkia-duration-fast) var(--lkia-easing); pointer-events:none; }
[data-lkia-root] [data-lkia-clip]:hover [data-lkia-grip], [data-lkia-root] [data-lkia-clip][data-selected="true"] [data-lkia-grip], [data-lkia-root] [data-lkia-clip][data-dragging="true"] [data-lkia-grip] { opacity:1; scale:1; }
[data-lkia-root] [data-lkia-clip][data-dragging="true"] [data-lkia-grip] { background:var(--lkia-accent); color:var(--lkia-on-accent); }

/* Dragging: the clip lifts off the board, follows the pointer and leans into its movement;
   the spot it left shows as a hole, the other clips step back, the open slots light up and
   the one beneath the clip opens to receive it. */
[data-lkia-root] [data-lkia-clip][data-dragging="true"] { z-index:40; cursor:grabbing; translate:var(--lkia-drag-x, 0) var(--lkia-drag-y, 0); rotate:var(--lkia-drag-tilt, 0deg); scale:1.08; outline-color:var(--lkia-accent); box-shadow:var(--lkia-shadow-lg); transition:rotate 140ms var(--lkia-easing), scale var(--lkia-duration-fast) var(--lkia-easing), outline-color var(--lkia-duration-fast) var(--lkia-easing); animation:none; } /* taste-skill-ignore: a dragged clip is lifted off the page */
[data-lkia-root] [data-drag-active="true"], [data-lkia-root] [data-drag-active="true"] * { cursor:grabbing; }
[data-lkia-root] [data-drag-active="true"] [data-lkia-clip]:not([data-dragging="true"]) { opacity:.42; filter:saturate(.5); scale:.97; }
[data-lkia-root] [data-lkia-cell] { position:relative; border-radius:var(--lkia-radius-video); }
[data-lkia-root] [data-lkia-cell]:has(> [data-dragging="true"])::before { content:""; position:absolute; inset:0; border-radius:inherit; border:3px dashed var(--lkia-accent); background:var(--lkia-accent-soft); animation:lkia-fade var(--lkia-duration) var(--lkia-easing) both; }
[data-lkia-root] [data-drag-active="true"] [data-lkia-drop] { border-color:var(--lkia-accent); color:var(--lkia-ink-1); animation:lkia-drop-breathe 1.4s ease-in-out infinite; }
[data-lkia-root] [data-drag-active="true"] [data-lkia-slot][data-drop-target="true"] [data-lkia-dropzone] { scale:1.05; background:var(--lkia-accent-soft); outline-color:var(--lkia-accent); }
[data-lkia-root] [data-drag-active="true"] [data-lkia-slot][data-drop-target="true"] [data-lkia-drop] { animation:none; border-style:solid; background:transparent; }
[data-lkia-root] [data-drag-active="true"] [data-lkia-slot][data-drop-target="true"] [data-lkia-slot-number] { background:var(--lkia-accent); color:var(--lkia-on-accent); scale:1.2; }
[data-lkia-root] [data-lkia-dropzone], [data-lkia-root] [data-lkia-slot-number] { transition:scale var(--lkia-duration-fast) var(--lkia-easing), background-color var(--lkia-duration-fast) var(--lkia-easing), outline-color var(--lkia-duration-fast) var(--lkia-easing); }

/* Every move ends in a flight: the clip travels from where it was to where it lands, and
   the slot that receives it flashes. */
[data-lkia-root] [data-lkia-clip][data-flip="true"] { z-index:30; animation:lkia-clip-fly var(--lkia-duration-slow) cubic-bezier(.2, .9, .25, 1.12) both; }
[data-lkia-root] [data-lkia-dropzone]:has(> [data-flip="true"]) { animation:lkia-slot-flash var(--lkia-duration-slow) var(--lkia-easing); }
@keyframes lkia-clip-fly { from { translate:var(--lkia-from-x, 0) var(--lkia-from-y, 0); scale:var(--lkia-from-scale, 1); } to { translate:0 0; scale:1; } }
@keyframes lkia-slot-flash { 0%, 55% { outline-color:var(--lkia-accent); } 100% { outline-color:transparent; } }
@keyframes lkia-drop-breathe { 0%, 100% { background-color:transparent; } 50% { background-color:var(--lkia-accent-soft); } }
[data-lkia-root] [data-lkia-loop] { display:block; width:100%; height:100%; }
[data-lkia-root] [data-lkia-loop] video { width:100%; height:100%; object-fit:contain; pointer-events:none; }
[data-lkia-root] [data-lkia-loop] [data-lkia-error] { z-index:1; }
[data-lkia-root] [data-lkia-loop] [data-lkia-error] { position:absolute; inset:0; display:grid; place-items:center; padding:1em; text-align:center; font-size:.55em; color:var(--lkia-ink-2); background:var(--lkia-surface-strong); }
[data-lkia-root] [data-lkia-clip-foot] { position:absolute; inset:auto 10px 10px 10px; display:flex; align-items:center; justify-content:space-between; gap:8px; pointer-events:none; }
[data-lkia-root] [data-lkia-clip-foot] button { pointer-events:auto; background:var(--lkia-bg); color:var(--lkia-ink-1); font-size:.6em; min-height:2em; padding:.25em .8em .25em .3em; }
[data-lkia-root] [data-lkia-clip-foot] button:focus-visible { outline-offset:2px; box-shadow:0 0 0 7px var(--lkia-bg); } /* taste-skill-ignore: a focus halo, never at rest */
[data-lkia-root] [data-lkia-loop] { position:relative; }
[data-lkia-root] [data-lkia-pause] { white-space:nowrap; }
[data-lkia-root] [data-lkia-clip-foot] [data-lkia-return] { padding:.25em; width:2em; }
[data-lkia-root] [data-lkia-clip-foot] [data-lkia-chip] { font-size:.9em; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-arrange] { grid-template-columns:minmax(0, 1fr); grid-template-areas:"help" "timeline" "pool" "announce" "actions"; gap:14px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-timeline], [data-lkia-root][data-lkia-layout="portrait"] [data-lkia-pool] { grid-template-columns:repeat(2, minmax(0, 1fr)); padding:12px; gap:12px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-help] { font-size:.85em; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-slot] [data-lkia-hint] { font-size:.9em; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-clip-name] { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-clip-foot] { inset:auto 6px 6px 6px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-clip-foot] button { padding:.2em; min-height:2.2em; min-width:2.2em; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-result] { font-size:.85em; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-pool]:not(:has([data-lkia-cell])) { display:none; }
@media (pointer: coarse) { [data-lkia-root] [data-lkia-clip] { touch-action:pan-y; } }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-clip-foot] button, [data-lkia-root][data-lkia-layout="portrait"] [data-lkia-drop] { font-size:.85em; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-actions] { justify-content:stretch; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-check] { width:100%; }

/* Cine-Scramble — the story, told: every clip beside its line, two to a row. */
[data-lkia-root] [data-lkia-complete] { flex:1; min-height:0; display:flex; flex-direction:column; gap:26px; }
[data-lkia-root] [data-lkia-celebrate] { display:inline-flex; align-items:center; gap:.4em; font-family:var(--lkia-font-heading); font-size:1.7em; font-weight:700; color:var(--lkia-accent); line-height:1; letter-spacing:-0.01em; outline:none; }
[data-lkia-root][data-lkia-template="cine-scramble"] [data-lkia-celebrate] { text-transform:uppercase; }
[data-lkia-root] [data-lkia-story] { display:flex; flex-direction:column; gap:10px; }
[data-lkia-root] [data-lkia-story] h3 { font-size:.8em; color:var(--lkia-ink-2); font-family:var(--lkia-font-body); font-weight:600; letter-spacing:0; }
[data-lkia-root] [data-lkia-story] p { font-size:1.1em; line-height:1.38; max-width:62ch; }
[data-lkia-root] [data-lkia-pairs] { display:flex; flex-direction:column; gap:16px; }
[data-lkia-root] [data-lkia-row] { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px; }
[data-lkia-root] [data-lkia-row] figure { display:grid; grid-template-columns:300px minmax(0, 1fr); gap:20px; align-items:center; padding:12px; background:var(--lkia-panel); border-radius:var(--lkia-radius-panel); }
[data-lkia-root] [data-lkia-complete][data-count="5"] [data-lkia-row], [data-lkia-root] [data-lkia-complete][data-count="6"] [data-lkia-row] { grid-template-columns:repeat(3, minmax(0, 1fr)); }
[data-lkia-root] [data-lkia-complete][data-count="5"] [data-lkia-row] figure, [data-lkia-root] [data-lkia-complete][data-count="6"] [data-lkia-row] figure { grid-template-columns:minmax(0, 1fr); }
[data-lkia-root] [data-lkia-complete][data-count="5"] [data-lkia-row] [data-lkia-loop], [data-lkia-root] [data-lkia-complete][data-count="6"] [data-lkia-row] [data-lkia-loop] { height:auto; aspect-ratio:16 / 9; max-height:190px; }
[data-lkia-root] [data-lkia-row] [data-lkia-loop] { height:169px; border-radius:var(--lkia-radius-video); overflow:hidden; background:#000; position:relative; }
[data-lkia-root] [data-lkia-row] figcaption { display:flex; gap:.6em; align-items:flex-start; font-size:.75em; line-height:1.32; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-row] { grid-template-columns:minmax(0, 1fr); gap:12px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-row] figure { grid-template-columns:minmax(0, 1fr); }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-row] [data-lkia-loop] { height:auto; aspect-ratio:16 / 9; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-celebrate] { font-size:1.5em; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-story] p { font-size:1.05em; }

/* The glossary floats above the activity, dimmed behind it. */
[data-lkia-root] [data-lkia-scrim] { position:absolute; inset:0; z-index:30; display:grid; place-items:center; padding:64px; background:rgba(0, 0, 0, .55); }
[data-lkia-root] [data-lkia-vocab] { width:min(1280px, 100%); max-height:100%; display:flex; flex-direction:column; gap:32px; padding:48px 56px; background:var(--lkia-panel); border-radius:var(--lkia-radius-panel); box-shadow:var(--lkia-shadow-lg); overflow:auto; } /* taste-skill-ignore: a modal dialog floats */
[data-lkia-root] [data-lkia-vocab-head] { display:flex; align-items:center; justify-content:space-between; gap:20px; }
[data-lkia-root] [data-lkia-vocab-head] h2 { font-size:2.2em; }
[data-lkia-root][data-lkia-template="cine-scramble"] [data-lkia-vocab-head] h2 { text-transform:uppercase; letter-spacing:0; }
[data-lkia-root] [data-lkia-vocab] dl { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:22px 48px; }
[data-lkia-root] [data-lkia-vocab] dl > div { background:var(--lkia-surface-strong); border-radius:calc(var(--lkia-radius-panel) * .7); padding:18px 22px; }
[data-lkia-root] [data-lkia-vocab] dt { font-weight:700; font-size:1.15em; }
[data-lkia-root] [data-lkia-vocab] dd { margin:6px 0 0; color:var(--lkia-ink-2); font-size:.9em; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-scrim] { padding:8px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-vocab] { padding:20px; gap:18px; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-vocab] dl { grid-template-columns:minmax(0, 1fr); }

[data-lkia-root][data-reduced-motion="true"] { --lkia-duration-fast:.01ms; --lkia-duration:.01ms; --lkia-duration-slow:.01ms; --lkia-stagger:0ms; }
[data-lkia-root][data-reduced-motion="true"] [data-animate], [data-lkia-root][data-reduced-motion="true"] [data-lkia-clip] { animation-name:lkia-fade; animation-duration:.01ms; transition-duration:.01ms; transform:none; }
[data-lkia-root][data-reduced-motion="true"] [data-lkia-clip]:hover, [data-lkia-root][data-reduced-motion="true"] [data-lkia-clip][data-selected="true"] { scale:1; }
[data-lkia-root][data-reduced-motion="true"] [data-lkia-clip][data-dragging="true"], [data-lkia-root][data-reduced-motion="true"] [data-lkia-supports] li { rotate:none; transition-delay:0ms; }
[data-lkia-root][data-reduced-motion="true"] [data-lkia-drop] { animation:none; }
@media (prefers-reduced-motion: reduce) {
  [data-lkia-root] [data-lkia-clip], [data-lkia-root] [data-lkia-watch], [data-lkia-root] [data-lkia-progress]::before, [data-lkia-root] [data-lkia-supports] li, [data-lkia-root] [data-lkia-drop] { animation-duration:.01ms; animation-iteration-count:1; transition-duration:.01ms; transition-delay:0ms; }
  [data-lkia-root] [data-lkia-clip][data-dragging="true"] { rotate:none; }
}
`;
