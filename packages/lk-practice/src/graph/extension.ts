/**
 * Goal-driven graph extensions (R2.6, design §8.9): `composeGraph` checks each
 * admitted extension against the base, unions them in id order, validates the
 * union and derives the composed version.
 */

import { defaultConfig } from '../config.js';
import { hashCanonical } from '../determinism/fnv.js';
import type {
  DiscoveryExtension,
  GraphComposition,
  GraphExtension,
  Issue,
  ResolvedPracticeConfig,
  SkillGraph,
} from '../types.js';
import { validateGraph } from './validate.js';

/** True when `id` is `prefix` or starts with `prefix` plus `.`. */
export function isUnderPrefix(id: string, prefix: string): boolean {
  return id === prefix || id.startsWith(`${prefix}.`);
}

/** The R2.6 rules for one extension against the base graph. */
export function extensionIssues(
  base: SkillGraph,
  extension: GraphExtension | DiscoveryExtension,
  path: readonly (string | number)[],
): Issue[] {
  if (extension.kind === 'prerequisite-discovery') return discoveryIssues(base, extension, path);
  const issues: Issue[] = [];
  const baseIds = new Set(base.skills.map((skill) => skill.id));
  const ownIds = new Set(extension.skills.map((skill) => skill.id));
  if (extension.status !== 'admitted') {
    issues.push({
      code: 'EXTENSION_NOT_ADMITTED',
      path: [...path, 'status'],
      message: `Extension "${extension.id}" is ${String(extension.status)}; only admitted extensions are composed.`,
    });
  }
  extension.skills.forEach((skill, i) => {
    if (!isUnderPrefix(skill.id, extension.idPrefix)) {
      issues.push({
        code: 'EXTENSION_ID_OUTSIDE_PREFIX',
        path: [...path, 'skills', i, 'id'],
        message: `Skill "${skill.id}" is not under the extension prefix "${extension.idPrefix}".`,
      });
    } else if (baseIds.has(skill.id)) {
      issues.push({
        code: 'ID_DUPLICATE',
        path: [...path, 'skills', i, 'id'],
        message: `Skill "${skill.id}" already exists in the base graph.`,
      });
    }
  });
  extension.edges.forEach((edge, i) => {
    const edgePath = [...path, 'edges', i];
    if (baseIds.has(edge.to) && !ownIds.has(edge.to)) {
      issues.push({
        code: 'EXTENSION_EDGE_INTO_BASE',
        path: [...edgePath, 'to'],
        message: `An extension edge may not point into the base skill "${edge.to}".`,
      });
    } else if (!ownIds.has(edge.to)) {
      issues.push({
        code: 'SKILL_UNKNOWN',
        path: [...edgePath, 'to'],
        message: `Edge to "${edge.to}" names no skill of this extension.`,
      });
    }
    if (!ownIds.has(edge.from) && !baseIds.has(edge.from)) {
      issues.push({
        code: 'SKILL_UNKNOWN',
        path: [...edgePath, 'from'],
        message: `Edge from "${edge.from}" names no skill of the base graph or this extension.`,
      });
    }
  });
  return issues;
}

/**
 * The rules for a `prerequisite-discovery` extension (R2.6, R14.8; revised in
 * M12): admitted; at most one skill, new to the base; exactly one edge, a
 * soft prerequisite into a base skill (the blocked one) from its own skill or
 * a base skill (`DISCOVERY_EDGE_INVALID`, `SKILL_UNKNOWN`); and an edge the
 * base does not have yet (`DISCOVERY_EDGE_EXISTS`). The union's cycles and
 * ladders are `validateGraph`'s.
 */
function discoveryIssues(
  base: SkillGraph,
  extension: DiscoveryExtension,
  path: readonly (string | number)[],
): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, at: readonly (string | number)[], message: string) =>
    issues.push({ code, path: [...path, ...at], message });
  const baseIds = new Set(base.skills.map((skill) => skill.id));
  const ownIds = new Set(extension.skills.map((skill) => skill.id));
  if (extension.status !== 'admitted') {
    add(
      'EXTENSION_NOT_ADMITTED',
      ['status'],
      `Extension "${extension.id}" is ${String(extension.status)}; only admitted extensions are composed.`,
    );
  }
  if (extension.skills.length > 1) {
    add('DISCOVERY_EDGE_INVALID', ['skills'], 'A discovery extension adds at most one skill.');
  }
  extension.skills.forEach((skill, i) => {
    if (baseIds.has(skill.id)) {
      add(
        'ID_DUPLICATE',
        ['skills', i, 'id'],
        `Skill "${skill.id}" already exists in the base graph.`,
      );
    }
  });
  const [edge, ...more] = extension.edges;
  if (
    edge === undefined ||
    more.length > 0 ||
    edge.kind !== 'prerequisite' ||
    edge.strength !== 'soft' ||
    edge.to !== extension.forSkillId
  ) {
    add(
      'DISCOVERY_EDGE_INVALID',
      ['edges'],
      `A discovery extension adds one soft prerequisite edge into "${extension.forSkillId}".`,
    );
    return issues;
  }
  if (!baseIds.has(edge.to)) {
    add(
      'SKILL_UNKNOWN',
      ['edges', 0, 'to'],
      `Edge to "${edge.to}" names no skill of the base graph.`,
    );
  }
  if (!baseIds.has(edge.from) && !ownIds.has(edge.from)) {
    add(
      'SKILL_UNKNOWN',
      ['edges', 0, 'from'],
      `Edge from "${edge.from}" names no skill of the base graph or this extension.`,
    );
  }
  if (
    base.edges.some(
      (found) => found.kind === 'prerequisite' && found.from === edge.from && found.to === edge.to,
    )
  ) {
    add(
      'DISCOVERY_EDGE_EXISTS',
      ['edges', 0],
      `"${edge.from}" is already a prerequisite of "${edge.to}".`,
    );
  }
  return issues;
}

/**
 * Composes a base graph with admitted extensions (R2.6, design §8.9). The
 * version is `base.version + '+' + fnv1a64(canonicalJson(sortedExtensionIds))`;
 * with no extensions the base is returned as it is. `config` is passed to
 * `validateGraph`; it defaults to the resolved default configuration. A
 * skill that two discovery extensions add the same is added once (revised in
 * M12): one new prerequisite confirmed for two skills before either was
 * admitted. Any other skill id used twice is `ID_DUPLICATE`.
 */
export function composeGraph(
  base: SkillGraph,
  extensions: readonly (GraphExtension | DiscoveryExtension)[],
  config?: ResolvedPracticeConfig,
): GraphComposition {
  const resolved = config ?? defaultConfig();
  if (extensions.length === 0) return validateGraph(base, resolved);

  const order = extensions
    .map((extension, index) => ({ extension, index }))
    .sort((a, b) =>
      a.extension.id < b.extension.id ? -1 : a.extension.id > b.extension.id ? 1 : 0,
    );

  const issues: Issue[] = [];
  const seenIds = new Set<string>();
  for (const { extension, index } of order) {
    const path = ['extensions', index];
    if (seenIds.has(extension.id)) {
      issues.push({
        code: 'ID_DUPLICATE',
        path: [...path, 'id'],
        message: `Extension id "${extension.id}" is passed twice.`,
      });
    }
    seenIds.add(extension.id);
    issues.push(...extensionIssues(base, extension, path));
  }
  if (issues.length > 0) return { ok: false, issues };

  const ids = order.map(({ extension }) => extension.id);
  const discovered = new Map<string, string>();
  const skills = order.flatMap(({ extension }) => {
    if (extension.kind !== 'prerequisite-discovery') return extension.skills;
    return extension.skills.filter((skill) => {
      const content = hashCanonical(skill);
      const known = discovered.get(skill.id);
      if (known === undefined) discovered.set(skill.id, content);
      return known !== content;
    });
  });
  const union: SkillGraph = {
    version: `${base.version}+${hashCanonical(ids)}`,
    skills: [...base.skills, ...skills],
    edges: [...base.edges, ...order.flatMap(({ extension }) => extension.edges)],
  };
  return validateGraph(union, resolved);
}
