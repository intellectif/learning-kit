/**
 * Checks every pending changeset against the release-note template in
 * docs/releasing.md, before it becomes a public release note.
 *
 * A changeset is not an internal commit message. Changesets copies it,
 * verbatim, into the package's CHANGELOG.md (which ships in the npm tarball),
 * into the GitHub Release for that version, and into the notes Renovate and
 * Dependabot put in front of every consumer who upgrades. The first thing those
 * readers need is what changed and whether they must do anything; the notes
 * that grew up here led with the design and said "no action needed" in their
 * last sentence, if at all, and pointed at `docs/…md` paths that link nowhere
 * outside this repository.
 *
 * Usage: `node scripts/check-changesets.mjs [directory]` — `.changeset` by
 * default. With no pending changesets there is nothing to check.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.argv[2] ?? join(ROOT, '.changeset');
const DOCS_URL = 'https://github.com/intellectif/learning-kit/blob/main/';
const BUMPS = new Set(['major', 'minor', 'patch']);
/** The summary is the entry's headline in every list it lands in. */
const SUMMARY_MAX = 200;

/** The packages this repository publishes: a changeset naming anything else is a typo. */
const published = new Set(
  readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      JSON.parse(readFileSync(join(ROOT, 'packages', entry.name, 'package.json'), 'utf8')),
    )
    .filter((manifest) => manifest.private !== true)
    .map((manifest) => manifest.name),
);

const failures = [];
const files = readdirSync(DIR).filter((name) => name.endsWith('.md') && name !== 'README.md');

for (const name of files) {
  const text = readFileSync(join(DIR, name), 'utf8').replace(/\r\n/g, '\n');
  const fail = (message) => failures.push(`${name}: ${message}`);

  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (front === null) {
    fail('has no frontmatter naming the packages and bumps.');
    continue;
  }
  const bumps = [];
  for (const line of front[1].split('\n').filter((row) => row.trim() !== '')) {
    const row = /^\s*['"]?([^'":]+)['"]?\s*:\s*(\w+)\s*$/.exec(line);
    if (row === null) {
      fail(`cannot read the frontmatter line "${line}".`);
      continue;
    }
    const [, pkg, bump] = row;
    if (!published.has(pkg)) {
      fail(`names "${pkg}", which this repository does not publish.`);
    }
    if (!BUMPS.has(bump)) {
      fail(`gives "${pkg}" the bump "${bump}"; it must be major, minor or patch.`);
    }
    bumps.push(bump);
  }

  const body = text.slice(front[0].length).trim();
  const paragraphs = body.split(/\n\s*\n/);
  const summary = paragraphs[0] ?? '';

  // 1. One line that says what changed, in bold, where every list shows it.
  if (summary.includes('\n')) {
    fail('starts with more than one line. The first paragraph is the headline: one line.');
  } else if (!/^\*\*[^*]+\*\*/.test(summary)) {
    fail('does not start with a bold headline, e.g. "**Delivery policies**: decide per paper …".');
  } else if (summary.length > SUMMARY_MAX) {
    fail(`has a headline of ${summary.length} characters; keep it to ${SUMMARY_MAX}.`);
  }

  // 2. Whether a consumer must do anything, said second, not last.
  const action = paragraphs[1] ?? '';
  if (!/^\*\*Action required:\*\*\s+\S/.test(action)) {
    fail(
      'does not say "**Action required:** …" in its second paragraph — "none", or what to do. ' +
        'A reader deciding whether to upgrade needs it before the detail.',
    );
  } else if (
    bumps.includes('major') &&
    /^\*\*Action required:\*\*\s+none\b/i.test(action) &&
    !/\bbecause\b|\bonly\b/i.test(action)
  ) {
    // A major that asks nothing of anyone reads as an alarm with no reason:
    // say why it is a major (in this repo, usually the lk-core peer bump).
    fail('is a major that requires no action, and does not say why it is a major.');
  }

  // The skeleton this check prints on failure, pasted and never filled in,
  // would otherwise pass: its placeholders have exactly the right shape.
  const placeholder =
    /<(What changed|one line a consumer can act on|the detail, as long as it needs to be|guide)>/.exec(
      body,
    );
  if (placeholder !== null) {
    fail(`still holds the template's placeholder "${placeholder[0]}".`);
  }

  // 3. Links that work where the note is read: npm, GitHub Releases, a bot's PR.
  const withoutUrls = body.replace(/https?:\/\/\S+/g, '');
  const bare = withoutUrls.match(/(?:^|[\s(`'"])(?:\.\/)?(?:docs|packages)\/[\w./-]+\.md\b/g);
  if (bare !== null) {
    fail(
      `refers to ${[...new Set(bare.map((hit) => hit.trim().replace(/^[(`'"]/, '')))].join(', ')} by path. ` +
        `Outside this repository that links nowhere — write the full URL, ${DOCS_URL}docs/….md.`,
    );
  }
  if (/\]\((?!https?:)[^)]+\)/.test(body)) {
    fail(
      'has a relative markdown link. Use a full URL: the note is read on npm and GitHub Releases.',
    );
  }
}

if (failures.length > 0) {
  console.error('check-changesets FAILED — see "Writing the release note" in docs/releasing.md:\n');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  // `pnpm changeset` writes the one line its prompt took; this is the shape
  // the rest of the note needs, ready to paste under the frontmatter.
  console.error(
    [
      '',
      'The body every note needs, under its frontmatter:',
      '',
      '  **<What changed>**: <one line a consumer can act on>.',
      '',
      '  **Action required:** none. (Or: what to do. On a major that asks nothing, say why it is a major.)',
      '',
      '  - <the detail, as long as it needs to be>',
      '',
      `  Guide: ${DOCS_URL}docs/<guide>.md`,
    ].join('\n'),
  );
  process.exit(1);
}

console.log(
  files.length === 0
    ? 'check-changesets OK: no pending changesets.'
    : `check-changesets OK: ${files.length} pending changeset${files.length === 1 ? ' follows' : 's follow'} the release-note template.`,
);
