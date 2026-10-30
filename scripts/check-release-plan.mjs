/**
 * Proves how a release of lk-core bumps the packages that peer on it, lk-react
 * and lk-azure, with this repository's own Changesets config and CLI.
 *
 * lk-react declares lk-core as a peer, and so does lk-azure. By default Changesets releases a peer
 * dependent as a MAJOR on any minor of its peer, whether or not the new
 * version is still in the declared range — which is why lk-react reached 22
 * while most of those majors broke nothing. 1.0 was meant to end that, and a
 * caret range alone cannot: the config's
 * `onlyUpdatePeerDependentsWhenOutOfRange` does. It sits under Changesets'
 * "experimental, will change in patch" key, and Changesets 3 removed it and
 * changed the rule again, so an upgrade of the tool could bring the cascade
 * back, or make lk-react ship a patch with a narrower peer range, without a
 * line of this repository changing. This check runs the real CLI in a scratch
 * workspace and fails if either happens.
 *
 * Usage: `node scripts/check-release-plan.mjs`. Needs git.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'node_modules', '@changesets', 'cli', 'bin.js');
const manifest = (dir) =>
  JSON.parse(readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8'));
const core = manifest('lk-core');
/** Every package that peers on lk-core, each held to the same rule. */
const dependents = ['lk-react', 'lk-azure'].map(manifest);
for (const dependent of dependents) {
  if (dependent.peerDependencies?.[core.name] === undefined) {
    console.error(
      `check-release-plan: ${dependent.name} no longer declares ${core.name} as a peer.`,
    );
    process.exit(1);
  }
}
const names = dependents.map((dependent) => dependent.name).join(' or ');

/**
 * What a dependent must do when lk-core releases: from 1.0, a minor or a patch
 * stays in range and releases nothing; a major leaves it and releases a major;
 * and on 0.x a minor leaves `^0.x`, so the dependent must still take a major.
 */
const CASES = [
  { core: '1.0.0', bump: 'minor', dependent: 'none' },
  { core: '1.0.0', bump: 'patch', dependent: 'none' },
  { core: '1.0.0', bump: 'major', dependent: 'major' },
  { core: '0.22.0', bump: 'minor', dependent: 'major' },
  { core: '0.22.0', bump: 'major', dependent: 'major' },
];

const config = JSON.parse(readFileSync(join(ROOT, '.changeset', 'config.json'), 'utf8'));
// The changelog generator is not part of the plan, and GitHub's needs a token.
config.changelog = false;

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.email=check@local', '-c', 'user.name=check', ...args], {
    cwd,
    stdio: 'ignore',
  });

function planFor({ core: coreVersion, bump }) {
  const dir = mkdtempSync(join(tmpdir(), 'lk-release-plan-'));
  try {
    const write = (path, content) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(
        join(dir, path),
        typeof content === 'string' ? content : JSON.stringify(content),
      );
    };
    write('package.json', { name: 'scratch', private: true });
    write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
    write('packages/core/package.json', { name: core.name, version: coreVersion });
    for (const [index, dependent] of dependents.entries()) {
      write(`packages/dependent-${index}/package.json`, {
        name: dependent.name,
        version: '1.0.0',
        peerDependencies: { [core.name]: dependent.peerDependencies[core.name] },
      });
    }
    write('.changeset/config.json', config);
    write('.changeset/release.md', `---\n'${core.name}': ${bump}\n---\n\nA release.\n`);
    git(dir, 'init', '-q', '-b', config.baseBranch ?? 'main');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'scratch');
    execFileSync(process.execPath, [CLI, 'status', '--output=plan.json'], {
      cwd: dir,
      stdio: 'ignore',
    });
    const { releases } = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
    return new Map(
      dependents.map((dependent) => [
        dependent.name,
        releases.find((release) => release.name === dependent.name)?.type ?? 'none',
      ]),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const failures = [];
for (const one of CASES) {
  for (const [name, got] of planFor(one)) {
    if (got !== one.dependent) {
      failures.push(
        `lk-core ${one.core} + a ${one.bump} releases ${name} as "${got}"; expected "${one.dependent}".`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('check-release-plan: the peer cascade is not what 1.0 promises.');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    '  See .changeset/config.json (onlyUpdatePeerDependentsWhenOutOfRange) and docs/releasing.md.',
  );
  process.exit(1);
}
console.log(
  `check-release-plan OK: from 1.0 an lk-core minor or patch releases no ${names}; ` +
    `a major, or any minor on 0.x, releases a major of each (${CASES.length} cases).`,
);
