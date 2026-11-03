/**
 * Prerequisite discovery in the log (R14.5 to R14.9, D29; revised in M12):
 * opening and closing hypotheses, probe answers and their verdict, and the
 * readiness of a confirmed prerequisite. Called by `applyEntry` only, so
 * replay equals record here too.
 */

import type {
  DiscoveryOptions,
  Evidence,
  EvidenceSource,
  HypothesisState,
  MappedEvidence,
  PrerequisiteHypothesis,
} from '../types.js';
import type { Draft } from './draft.js';

/** Opens a hypothesis (R14.5); `act` checked it, so it is new. */
export function openHypothesis(draft: Draft, at: number, hypothesis: PrerequisiteHypothesis): void {
  const { id, forSkillId, skillId, skill } = hypothesis;
  draft.setHypothesis(id, {
    id,
    forSkillId,
    skillId,
    ...(skill === undefined ? {} : { skill }),
    openedAt: at,
    probes: Object.freeze({ passed: 0, failed: 0 }),
    verdict: 'open',
    decidedAt: null,
    practisedAt: null,
    reprobeStreak: 0,
    readyAt: null,
    blockedPassedAt: null,
    blockedFailures: 0,
    closedAt: null,
  });
  draft.emit({ type: 'hypothesis.opened', at, hypothesisId: id, skillId, forSkillId });
}

/** Closes a hypothesis (R14.5): no more probes, no planning, no advice. */
export function closeHypothesis(draft: Draft, at: number, hypothesisId: string): void {
  const hypothesis = draft.hypothesis(hypothesisId);
  if (hypothesis === undefined || hypothesis.closedAt !== null) return;
  draft.setHypothesis(hypothesisId, { ...hypothesis, closedAt: at });
  draft.emit({ type: 'hypothesis.closed', at, hypothesisId });
}

/** Whether a probe answer passed: a graded one by its verdict, a self-rated one unless `again`. */
function probePassed(source: EvidenceSource): boolean {
  if (source.kind === 'self') return source.rating !== 'again';
  return 'passed' in source && source.passed;
}

/**
 * The verdict after `passed` of `passed + failed` probe answers (R14.7), from
 * `minProbes` on: refuted at `refuteFrom`; confirmed below `confirmBelow`, or
 * at `maxProbes` when not refuted; open otherwise. Doubt confirms: a share
 * passed short of `refuteFrom` at the reference difficulty is short of the
 * standard a dependent relies on, and a needless prerequisite costs some
 * practice and draws revoking advice (R14.10), where a missed one leaves the
 * learner failing.
 */
export function probeVerdict(
  probes: HypothesisState['probes'],
  options: Required<DiscoveryOptions>,
): HypothesisState['verdict'] {
  const answers = probes.passed + probes.failed;
  if (answers < options.minProbes) return 'open';
  const share = probes.passed / answers;
  if (share >= options.refuteFrom) return 'refuted';
  if (share < options.confirmBelow || answers >= options.maxProbes) return 'confirmed';
  return 'open';
}

/** Whether a hypothesis takes probe answers: open, or confirmed with its prerequisite not ready. */
export function probing(hypothesis: HypothesisState): boolean {
  if (hypothesis.closedAt !== null) return false;
  return (
    hypothesis.verdict === 'open' ||
    (hypothesis.verdict === 'confirmed' && hypothesis.readyAt === null)
  );
}

/**
 * A probe answer (R14.6, R14.7, R14.9): on an open hypothesis, its tally and
 * its verdict once the probes decide; on a confirmed one, a re-probe: passed
 * `readyAfter` times in a row, the prerequisite reached its floor (`readyAt`);
 * passed fewer, the next re-probe follows; failed, practice comes first again.
 * Returns the blocked skill when the answer made its prerequisite ready, for
 * its fresh start (`applyMapped`), and null otherwise. Nothing else changes:
 * no skill's memory, ability, stage or mastery. An answer for a hypothesis
 * that takes none meanwhile (a late entry put before it by replay) changes
 * nothing.
 */
export function applyProbe(
  draft: Draft,
  evidence: Evidence,
  options: Required<DiscoveryOptions>,
): string | null {
  const hypothesisId = evidence.probe as string;
  const hypothesis = draft.hypothesis(hypothesisId);
  if (hypothesis === undefined || !probing(hypothesis)) return null;
  const { at } = evidence;
  const passed = probePassed(evidence.source);
  if (hypothesis.verdict === 'confirmed') {
    const reprobeStreak = passed ? hypothesis.reprobeStreak + 1 : 0;
    const ready = reprobeStreak >= options.readyAfter;
    draft.setHypothesis(hypothesisId, {
      ...hypothesis,
      reprobeStreak,
      ...(passed ? {} : { practisedAt: null }),
      ...(ready ? { readyAt: at } : {}),
    });
    draft.emit({ type: 'hypothesis.probed', at, hypothesisId, evidenceId: evidence.id, passed });
    if (!ready) return null;
    draft.emit({ type: 'hypothesis.ready', at, hypothesisId });
    return hypothesis.forSkillId;
  }
  const probes = Object.freeze({
    passed: hypothesis.probes.passed + (passed ? 1 : 0),
    failed: hypothesis.probes.failed + (passed ? 0 : 1),
  });
  const verdict = probeVerdict(probes, options);
  draft.setHypothesis(hypothesisId, {
    ...hypothesis,
    probes,
    ...(verdict === 'open' ? {} : { verdict, decidedAt: at }),
  });
  draft.emit({ type: 'hypothesis.probed', at, hypothesisId, evidenceId: evidence.id, passed });
  if (verdict !== 'open') draft.emit({ type: 'hypothesis.decided', at, hypothesisId, verdict });
  return null;
}

/**
 * After an answer that is practice (not diagnostic or a pretest), the
 * confirmed hypotheses it bears on (R14.9, R14.10): while the prerequisite is
 * not ready, a pass on it since the confirmation or the last failed re-probe
 * makes a re-probe due (`practisedAt`); once it is ready, the first pass on
 * the blocked skill is recorded, and its failures before one counted.
 * Entries apply in time order, so an answer always comes after the verdict
 * and the readiness it is measured against.
 */
export function trackDiscovery(draft: Draft, evidence: Evidence, mapped: MappedEvidence): void {
  if (evidence.context === 'diagnostic' || evidence.context === 'pretest') return;
  const passed = new Map<string, boolean>();
  for (const effect of mapped.perSkill) {
    if (effect.rating !== null) passed.set(effect.skillId, effect.rating !== 'again');
  }
  if (passed.size === 0) return;
  const { at } = evidence;
  const changes: { id: string; hypothesis: HypothesisState }[] = [];
  draft.forEachHypothesis((id, hypothesis) => {
    if (hypothesis.verdict !== 'confirmed' || hypothesis.closedAt !== null) return;
    if (hypothesis.readyAt === null) {
      if (hypothesis.practisedAt === null && passed.get(hypothesis.skillId) === true) {
        changes.push({ id, hypothesis: { ...hypothesis, practisedAt: at } });
      }
      return;
    }
    const blocked = passed.get(hypothesis.forSkillId);
    if (blocked === undefined || hypothesis.blockedPassedAt !== null) return;
    changes.push({
      id,
      hypothesis: blocked
        ? { ...hypothesis, blockedPassedAt: at }
        : { ...hypothesis, blockedFailures: hypothesis.blockedFailures + 1 },
    });
  });
  // Applied after the walk, which reads the draft's records.
  for (const { id, hypothesis } of changes) draft.setHypothesis(id, hypothesis);
}

/**
 * Whether a diagnosis is already under way for `skillId` (R14.2): a hypothesis
 * for it open, or confirmed and still on trial: its prerequisite not ready,
 * or ready with the skill neither passed since nor failed `revokeAfter` times
 * (R14.10), so a found prerequisite has its chance before another is sought.
 */
export function diagnosisUnderWay(
  draft: Draft,
  skillId: string,
  options: Required<DiscoveryOptions>,
): boolean {
  let found = false;
  draft.forEachHypothesis((_id, hypothesis) => {
    if (hypothesis.forSkillId !== skillId || hypothesis.closedAt !== null) return;
    if (hypothesis.verdict === 'open') found = true;
    else if (
      hypothesis.verdict === 'confirmed' &&
      hypothesis.blockedPassedAt === null &&
      hypothesis.blockedFailures < options.revokeAfter
    ) {
      found = true;
    }
  });
  return found;
}
