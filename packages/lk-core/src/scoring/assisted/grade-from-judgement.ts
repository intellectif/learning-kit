import { type GradeFromRubricOptions, gradeFromRubric } from '../../grading.js';
import { levelKey } from '../../rubric-levels.js';
import type { WrittenResponseData } from '../../types/activity.js';
import type { AiGradingJudgement } from '../../types/ai.js';
import type { CriterionScore, GradeRecord } from '../../types/grading.js';

/** Options for {@link gradeFromJudgement}: those of `gradeFromRubric`, but the feedback is the model's. */
export type GradeFromJudgementOptions = Omit<GradeFromRubricOptions, 'feedback'>;

/**
 * The grade a checked model judgement gives a written response: the total
 * computed as `gradeFromRubric` computes every grade — never by the model — with
 * the item's own weights and pass line, and the record a host keeps.
 *
 * Each criterion scores what `checkAiGrading` read: a level's place on its
 * scale, or the model's score from 0 to 1. The level chosen is kept as `band`,
 * its probabilities as `levelProbabilities`, and the model's identity as
 * `grader` (`kind: 'ai'`, with its `model` and `promptHash`), so a routing rule
 * and a calibration can read them later.
 *
 * `data` must be the item the request was built from: a judgement that names a
 * criterion this rubric does not have, or leaves one of its criteria out, is
 * `unscorable` rather than a grade on another task's rubric.
 */
export function gradeFromJudgement(
  judgement: AiGradingJudgement,
  data: WrittenResponseData,
  options: GradeFromJudgementOptions = {},
): GradeRecord | { unscorable: true; reason: string } {
  const authored = data.rubric?.criteria ?? [];
  const byName = new Map(authored.map((criterion) => [levelKey(criterion.name), criterion]));
  if (byName.size !== authored.length) {
    return {
      unscorable: true,
      reason:
        "This item's rubric names a criterion twice, so a judgement cannot say which of the two it grades.",
    };
  }
  const judged = new Set<string>();
  const criteria: CriterionScore[] = [];
  for (const one of judgement.criteria) {
    const criterion = byName.get(levelKey(one.name));
    if (criterion === undefined || judged.has(levelKey(one.name))) {
      return {
        unscorable: true,
        reason: `The judgement names criterion "${one.name}", which this item's rubric does not have once. Grade it with the item it was asked about.`,
      };
    }
    judged.add(levelKey(one.name));
    criteria.push({
      name: criterion.name,
      score: one.score,
      weight: criterion.weight,
      ...(one.level !== undefined ? { band: one.level } : {}),
      ...(one.probabilities !== undefined ? { levelProbabilities: [...one.probabilities] } : {}),
      ...(one.comment !== undefined ? { comment: one.comment } : {}),
    });
  }
  const unjudged = authored.find((criterion) => !judged.has(levelKey(criterion.name)));
  if (unjudged !== undefined) {
    return {
      unscorable: true,
      reason: `The judgement leaves out criterion "${unjudged.name}". A total over fewer criteria would grade a different task.`,
    };
  }
  const grade = gradeFromRubric(criteria, data, { ...options, feedback: judgement.feedback });
  if ('unscorable' in grade) {
    return grade;
  }
  const { provenance, usage } = judgement;
  return {
    ...grade,
    ...(judgement.corrections.length > 0 ? { corrections: [...judgement.corrections] } : {}),
    ...(judgement.rationale !== undefined ? { rationale: judgement.rationale } : {}),
    requiresHumanReview: judgement.requiresHumanReview,
    grader: {
      kind: 'ai',
      ...(provenance?.model !== undefined ? { model: provenance.model } : {}),
      ...(provenance?.promptHash !== undefined ? { promptHash: provenance.promptHash } : {}),
    },
    ...(usage !== undefined ? { usage } : {}),
    ...(provenance?.generatedAt !== undefined ? { gradedAt: provenance.generatedAt } : {}),
  };
}
