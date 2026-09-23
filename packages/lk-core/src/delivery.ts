import type {
  DeliveryPolicy,
  DeliveryPolicyIssue,
  ResolvedDeliveryPolicy,
} from './types/delivery.js';

/**
 * The policy that restricts nothing: every setting `true`. It is what an absent
 * policy resolves to, and it is exactly the behaviour the SDK had before
 * delivery policies existed.
 */
export const OPEN_DELIVERY_POLICY: ResolvedDeliveryPolicy = Object.freeze({
  feedback: true,
  solutions: true,
  hints: true,
  ai: Object.freeze({ hints: true, explanations: true }),
}) as ResolvedDeliveryPolicy;

const SETTINGS = ['feedback', 'solutions', 'hints'] as const;
const AI_SETTINGS = ['hints', 'explanations'] as const;

/**
 * One setting as a render reads it. Absent or `null` is unset, and unset is
 * `true`: JSON has no `undefined`, so a setting nobody chose arrives from a
 * database as `null`.
 *
 * Anything else that is not exactly `true` reads as `false`. Every setting is a
 * restriction, so a value that cannot be read is read as the restriction — a
 * `"false"` string from a form, say, whose author meant exactly that. Reading
 * it as `true` would put hints on a paper whose school had switched them off.
 */
function allows(value: unknown): boolean {
  return value === undefined || value === null || value === true;
}

/**
 * A policy with every setting spelled out — see {@link DeliveryPolicy}.
 *
 * Tolerant, because it runs where a learner is waiting: nothing here throws.
 * A value it cannot read restricts rather than allows (see above), and a
 * policy that is not an object at all restricts everything. Check a policy
 * before you store it with {@link validateDeliveryPolicy}; `planAttempt` does.
 */
export function resolveDeliveryPolicy(policy: unknown): ResolvedDeliveryPolicy {
  if (policy === undefined || policy === null) {
    return OPEN_DELIVERY_POLICY;
  }
  if (typeof policy !== 'object' || Array.isArray(policy)) {
    return {
      feedback: false,
      solutions: false,
      hints: false,
      ai: { hints: false, explanations: false },
    };
  }
  const given = policy as Record<string, unknown>;
  const ai = given.ai;
  // `true` and `false` are shorthand for both AI settings at once. `true`
  // restricts nothing, which is also what leaving `ai` out does — so reading it
  // generously cannot switch on anything a school did not already allow.
  const aiGiven =
    ai === undefined || ai === null || ai === true
      ? {}
      : typeof ai === 'object' && !Array.isArray(ai)
        ? (ai as Record<string, unknown>)
        : { hints: false, explanations: false };
  return {
    feedback: allows(given.feedback),
    solutions: allows(given.solutions),
    hints: allows(given.hints),
    ai: { hints: allows(aiGiven.hints), explanations: allows(aiGiven.explanations) },
  };
}

/**
 * The strictest of several policies: a setting is on only where every one of
 * them leaves it on. How a course's policy and an assessment's combine, and
 * how a pager's policy wins over whatever a question it draws was handed.
 */
export function combineDeliveryPolicies(...policies: unknown[]): ResolvedDeliveryPolicy {
  const resolved = policies.map(resolveDeliveryPolicy);
  const every = (read: (one: ResolvedDeliveryPolicy) => boolean): boolean => resolved.every(read);
  return {
    feedback: every((one) => one.feedback),
    solutions: every((one) => one.solutions),
    hints: every((one) => one.hints),
    ai: {
      hints: every((one) => one.ai.hints),
      explanations: every((one) => one.ai.explanations),
    },
  };
}

/**
 * Checks a policy before it is stored: each setting `true`, `false`, `null`
 * or absent, and nothing else — no misspelled setting, no string standing in
 * for a boolean.
 *
 * Stricter than {@link resolveDeliveryPolicy} on purpose. A misspelled
 * restriction (`hint: false`) is silently no restriction at all, and a
 * policy is a record of the conditions a paper was sat under: it is worth
 * refusing before it is written down, rather than read charitably after.
 */
export function validateDeliveryPolicy(
  policy: unknown,
): { success: true; data: DeliveryPolicy } | { success: false; issues: DeliveryPolicyIssue[] } {
  const issues: DeliveryPolicyIssue[] = [];
  if (policy === undefined || policy === null) {
    return { success: true, data: {} };
  }
  if (typeof policy !== 'object' || Array.isArray(policy)) {
    return {
      success: false,
      issues: [{ path: '', message: 'A delivery policy is an object of settings.' }],
    };
  }
  const given = policy as Record<string, unknown>;
  for (const key of Object.keys(given)) {
    if (key === 'ai') {
      continue;
    }
    if (!(SETTINGS as readonly string[]).includes(key)) {
      issues.push({
        path: key,
        message: `"${key}" is not a delivery setting. The settings are feedback, solutions, hints and ai.`,
      });
      continue;
    }
    const value = given[key];
    if (value !== true && value !== false && value !== null && value !== undefined) {
      issues.push({ path: key, message: `"${key}" must be true, false or null.` });
    }
  }
  const ai = given.ai;
  if (ai !== undefined && ai !== null && ai !== true && ai !== false) {
    if (typeof ai !== 'object' || Array.isArray(ai)) {
      issues.push({
        path: 'ai',
        message: '"ai" must be true, false, or an object of hints and explanations.',
      });
    } else {
      for (const [key, value] of Object.entries(ai as Record<string, unknown>)) {
        if (!(AI_SETTINGS as readonly string[]).includes(key)) {
          issues.push({
            path: `ai.${key}`,
            message: `"ai.${key}" is not an AI setting. The settings are hints and explanations.`,
          });
          continue;
        }
        if (value !== true && value !== false && value !== null && value !== undefined) {
          issues.push({ path: `ai.${key}`, message: `"ai.${key}" must be true, false or null.` });
        }
      }
    }
  }
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: given as DeliveryPolicy };
}
