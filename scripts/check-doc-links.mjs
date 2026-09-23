/**
 * Checks that every link between this repository's documents lands: the file
 * exists, and so does the heading an anchor names.
 *
 * The documents link to each other constantly — the upgrading guide's version
 * routes, a changelog's "see the guide", the npm READMEs' absolute links back
 * into docs/ — and each release renames a heading or moves a section. A link
 * that breaks does so silently: GitHub renders it, and the reader lands at the
 * top of the wrong page, or on a 404 from an npm page.
 *
 * Covers relative links, and absolute links into this repository
 * (`https://github.com/intellectif/learning-kit/blob|tree/main/…`), in every
 * Markdown file git tracks or would track — a new guide is checked before it
 * is committed, when fixing it is cheapest, and a file .gitignore excludes is
 * not a document anyone reads. Links inside code are not links, and are
 * skipped.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_URL =
  /^https:\/\/github\.com\/intellectif\/learning-kit\/(?:blob|tree)\/main\/([^#?]*)(#.*)?$/;

/** Markdown git tracks, or would: ignored scratch notes and internal docs are nobody's reading. */
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.md', '**/*.md'],
  { cwd: ROOT, encoding: 'utf8' },
)
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.includes('CHANGELOG.md'));

/** GitHub's heading anchor: lower case, punctuation and symbols dropped, spaces as hyphens. */
function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

/** Code is not prose: fenced blocks and inline code spans hold no links. */
function prose(text) {
  return text.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
}

const anchorCache = new Map();
/** Every anchor a Markdown file offers: its headings, numbered as GitHub numbers repeats, and explicit ids. */
function anchorsOf(file) {
  const cached = anchorCache.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const text = readFileSync(file, 'utf8').replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
  const anchors = new Set();
  const seen = new Map();
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = slug(match[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  for (const match of text.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) {
    anchors.add(match[1]);
  }
  anchorCache.set(file, anchors);
  return anchors;
}

/** A repository path as a reader writes it, whatever the platform. */
const shown = (path) => relative(ROOT, path).split(sep).join('/');

const failures = [];
let checked = 0;

for (const file of files) {
  const full = join(ROOT, file);
  if (!existsSync(full)) {
    continue;
  }
  const text = prose(readFileSync(full, 'utf8'));
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    let path;
    let anchor;
    const repo = REPO_URL.exec(target);
    if (repo !== null) {
      path = join(ROOT, decodeURIComponent(repo[1]));
      anchor = repo[2];
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      continue; // any other scheme: someone else's page
    } else if (target.startsWith('#')) {
      path = full;
      anchor = target;
    } else {
      const [p, a] = target.split('#');
      path = resolve(dirname(full), decodeURIComponent(p));
      anchor = a === undefined ? undefined : `#${a}`;
    }
    checked += 1;
    const where = `${file}: ${target}`;
    if (!existsSync(path)) {
      failures.push(`${where} — ${shown(path)} does not exist`);
      continue;
    }
    if (anchor !== undefined && anchor !== '#' && statSync(path).isFile() && path.endsWith('.md')) {
      if (!anchorsOf(path).has(decodeURIComponent(anchor.slice(1)))) {
        failures.push(`${where} — no heading in ${shown(path)} gives the anchor ${anchor}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('check-doc-links FAILED:\n');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`check-doc-links OK: ${checked} links in ${files.length} documents land.`);
