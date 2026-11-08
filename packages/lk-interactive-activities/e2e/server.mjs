import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// esbuild is the repository's existing build-only dependency, not a package dependency.
const require = createRequire(new URL('../../../package.json', import.meta.url));
const { build } = require('esbuild');
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./fixture.tsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const sandbox =
  'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals allow-downloads allow-same-origin';
const allow = 'fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write';
createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost:4176');
  if (url.pathname === '/player.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(bundle.outputFiles[0].contents);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html' });
  if (url.pathname === '/player')
    response.end(
      '<!doctype html><html><body><div id="root"></div><script src="/player.js"></script></body></html>',
    );
  else
    response.end(
      `<!doctype html><html><body><iframe title="Activity" sandbox="${sandbox}" allow="${allow}" style="width:100%;height:850px;border:0" src="http://127.0.0.1:4176/player?template=${url.searchParams.get('template') || 'what-happens'}"></iframe></body></html>`,
    );
}).listen(4176, () => console.log('M5 iframe fixture ready on 4176'));
