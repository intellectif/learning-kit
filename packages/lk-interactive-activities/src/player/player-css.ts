/** Scoped by Stage so independently themed players can coexist. */
export const PLAYER_CSS = `
[data-lkia-root] { position:relative; isolation:isolate; overflow:hidden; box-sizing:border-box; }
[data-lkia-root] *, [data-lkia-root] *::before { box-sizing:border-box; }
[data-lkia-root] button, [data-lkia-root] select { font:inherit; color:inherit; background:var(--lkia-panel); border:2px solid var(--lkia-line); border-radius:var(--lkia-radius-button); padding:.55em .9em; cursor:pointer; }
[data-lkia-root] :focus-visible { outline:3px solid var(--lkia-accent); outline-offset:3px; }
[data-lkia-root] h1 { margin:0 0 .6em; }
[data-lkia-root] h2 { margin:.3em 0; }
[data-lkia-root] [data-lkia-stage] { position:relative; padding:40px; font-size:28px; overflow:auto; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-stage] { padding:16px; font-size:18px; }
[data-lkia-root] [data-lkia-board] { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:24px; }
[data-lkia-root] [data-lkia-board] img { display:block; width:100%; max-height:220px; object-fit:cover; }
[data-lkia-root] [data-lkia-backdrop], [data-lkia-root] [data-lkia-veil] { position:absolute; inset:0; background-size:cover; background-position:center; pointer-events:none; z-index:-2; }
[data-lkia-root] [data-lkia-veil] { z-index:-1; }
[data-lkia-root] [data-lkia-watch] > section:empty { display:none; }
[data-lkia-root][data-stage="tell"] [data-lkia-watch] > video, [data-lkia-root][data-stage="answer"] [data-lkia-watch] > video { max-width:42%; }
[data-lkia-root] [data-lkia-watch] { display:flex; justify-content:center; gap:36px; align-items:center; }
[data-lkia-root] [data-lkia-watch] > video { min-width:0; max-width:65%; max-height:820px; object-fit:contain; transition:max-width var(--lkia-duration) var(--lkia-easing); border-radius:var(--lkia-radius-video); }
[data-lkia-root] [data-lkia-watch] > section { flex:1; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-watch] { flex-direction:column; }
[data-lkia-root][data-lkia-layout="portrait"][data-stage] [data-lkia-watch] > video { max-width:100%; max-height:60vh; }
[data-lkia-root] [data-lkia-panel] { padding:24px; }
[data-lkia-root] [data-lkia-actions] { display:flex; flex-wrap:wrap; gap:12px; margin-top:20px; }
[data-lkia-root] [data-lkia-underline] { background:transparent; color:inherit; text-decoration:underline; text-underline-offset:.15em; }
[data-lkia-root] [data-lkia-slots], [data-lkia-root] [data-lkia-pool] { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; margin:20px 0; }
[data-lkia-root] [data-lkia-slots] { grid-template-columns:repeat(var(--lkia-clip-count),minmax(0,1fr)); }
[data-lkia-root] [data-lkia-slot] { border:3px dashed var(--lkia-line); padding:12px; min-height:120px; border-radius:var(--lkia-radius-panel); }
[data-lkia-root] [data-slot-result="correct"] { border-style:solid; border-color:var(--lkia-accent); }
[data-lkia-root] [data-slot-result="incorrect"] { border-style:double; border-width:6px; }
[data-lkia-root] [data-drop-target="true"] { outline:4px solid var(--lkia-accent); }
[data-lkia-root] [data-lkia-clip] { margin:0; padding:0; min-width:0; border:0; touch-action:none; user-select:none; cursor:grab; }
[data-lkia-root] [data-lkia-clip] video { width:100%; max-height:230px; object-fit:contain; pointer-events:none; }
[data-lkia-root] [data-lkia-row] { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; margin:16px 0; }
[data-lkia-root] [data-lkia-row] video { width:100%; max-height:240px; }
[data-lkia-root] [data-lkia-vocab] { position:absolute; inset:40px; overflow:auto; z-index:3; background:var(--lkia-bg); }
[data-lkia-root] [data-lkia-poster] { max-width:40%; max-height:500px; object-fit:contain; }
[data-lkia-root][data-lkia-layout="portrait"] [data-lkia-slots], [data-lkia-root][data-lkia-layout="portrait"] [data-lkia-pool] { grid-template-columns:repeat(2,minmax(0,1fr)); }
[data-lkia-root][data-reduced-motion="true"] [data-animate] { animation-name:lkia-fade; animation-duration:.01ms; transition-duration:.01ms; transform:none; }
`;
