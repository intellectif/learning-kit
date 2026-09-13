import { UnknownActivityTypeError } from '../errors.js';
import { getActivityTypeDescriptor } from '../registry/index.js';
import type { ActivityDataMap, ActivityType } from '../types/activity.js';
import type { DraftContext, DraftIssue, DraftValidationResult } from '../types/authoring.js';
import {
  DRAFT_ISSUE_SEVERITY,
  type DraftIssueCode,
  isRecord,
  issue,
  refusesEmpty,
} from './issues.js';

/**
 * Tells a draft that is not finished from a draft that is wrong.
 *
 * `validateActivity` answers "may this be stored?", and to that question an
 * empty new question and a broken one are the same answer: no. An editor needs
 * the difference — "Add a title" is a to-do, "Only one option can be marked
 * correct" is an error — so a freshly added question does not read as a
 * failure, disable a whole form, or blank a preview.
 *
 * - `complete` — the draft is a valid activity with nothing left to write.
 *   `data` is exactly what `validateActivity` returns for it.
 * - `incomplete` — every problem is something not yet written.
 * - `invalid` — at least one problem is wrong in a way writing more cannot fix.
 *
 * It is stricter than `validateActivity`, never looser: `complete` requires the
 * activity's schema to pass, and a draft can fail here that the schema accepts
 * (a title that is only whitespace). Content stored by an older build can
 * therefore be valid and still not `complete`. `validateActivity` stays the
 * check at your write boundary.
 *
 * Issues come from the type's `authoring.checkDraft`, plus every schema failure
 * it did not already report at that path or inside it. (A failure at the root of
 * the draft counts as reported only by an issue at the root, since every path is
 * inside the root.) Such a failure is added as `invalid`: under the code
 * `null_not_allowed` when the schema refused a `null` there, or an `undefined`
 * entry in a list, and otherwise under the schema's own code and message. A type
 * with no `checkDraft` therefore reports every schema failure as `invalid`.
 *
 * The codes documented in `docs/authoring.md` are a contract, and each is
 * reported with its documented severity, whichever check reports it. A code
 * passed through from the schema is not a contract: the code and its English
 * message belong to the schema library, so give a code you do not recognise a
 * generic message of your own.
 *
 * @throws UnknownActivityTypeError when `type` has no registered descriptor —
 *   including `'item-group'`, which is a container, not an activity type.
 */
export function validateDraft<T extends ActivityType>(
  type: T,
  draft: unknown,
): DraftValidationResult<ActivityDataMap[T]> {
  const descriptor = getActivityTypeDescriptor(type);
  if (descriptor === undefined) {
    throw new UnknownActivityTypeError(String(type));
  }

  const reported =
    isRecord(draft) && descriptor.authoring?.checkDraft !== undefined
      ? descriptor.authoring.checkDraft(draft).map(normalise)
      : [];
  const issues: DraftIssue[] = [...reported];

  // `reportInput` records on each issue the value its check was given, which is
  // how a refused `null` is told apart from a rule that merely points at one.
  const parsed = descriptor.schema.safeParse(draft, { reportInput: true });
  if (!parsed.success) {
    const reportedEmpty = new Set<string>();
    for (const schemaIssue of parsed.error.issues) {
      const path = schemaIssue.path.map(String);
      if (reported.some((known) => covers(known.path, path))) {
        continue;
      }
      // `null` is how many editors and databases spell "no value". Where the
      // schema refuses one, name it under one documented code, for every type,
      // rather than hand over the schema library's own diagnostic.
      if (path.length > 0 && refusesEmpty(draft, schemaIssue)) {
        const key = JSON.stringify(path);
        if (!reportedEmpty.has(key)) {
          reportedEmpty.add(key);
          issues.push(
            issue(
              'null_not_allowed',
              path,
              typeof schemaIssue.path.at(-1) === 'number'
                ? 'This entry has no value. Remove it, or fill it in.'
                : 'This field cannot be null. Leave it out if it is optional, or give it a value.',
            ),
          );
        }
        continue;
      }
      issues.push({
        path,
        message: schemaIssue.message,
        code: schemaIssue.code,
        severity: 'invalid',
      });
    }
  }

  if (parsed.success && issues.length === 0) {
    return { status: 'complete', data: parsed.data as ActivityDataMap[T], issues };
  }
  const invalid = issues.some((found) => found.severity !== 'incomplete');
  return { status: invalid ? 'invalid' : 'incomplete', issues };
}

/**
 * A new, empty draft of an activity type, for an editor to start from.
 *
 * Every required field is present and nothing is authored, so the draft comes
 * back from {@link validateDraft} as `incomplete`, and `validateActivity`
 * rejects it until someone writes it. The SDK invents no ids: `newId` is called
 * once per id the draft needs, and must return a different non-empty string each
 * time.
 *
 * ```ts
 * const draft = createDraft('multiple-choice', { newId: () => crypto.randomUUID() });
 * ```
 *
 * @throws UnknownActivityTypeError when `type` has no registered descriptor.
 * @throws Error when the type declares no `authoring.createDraft`, or when
 *   `newId` returns an empty or repeated id.
 */
export function createDraft<T extends ActivityType>(
  type: T,
  context: DraftContext,
): ActivityDataMap[T] {
  const descriptor = getActivityTypeDescriptor(type);
  if (descriptor === undefined) {
    throw new UnknownActivityTypeError(String(type));
  }
  const create = descriptor.authoring?.createDraft;
  if (create === undefined) {
    throw new Error(
      `Activity type "${String(type)}" declares no authoring.createDraft, so there is no empty draft to create. ` +
        'Build the draft yourself; validateDraft works for every registered type.',
    );
  }
  const issued = new Set<string>();
  const newId = (): string => {
    const id: unknown = context.newId();
    if (typeof id !== 'string' || id === '') {
      throw new Error('createDraft: newId() must return a non-empty string.');
    }
    if (issued.has(id)) {
      throw new Error(
        `createDraft: newId() returned "${id}" twice. Ids within one draft must differ — two options sharing an id cannot be scored apart.`,
      );
    }
    issued.add(id);
    return id;
  };
  return create({ newId }) as ActivityDataMap[T];
}

/**
 * A check's issue as `validateDraft` reports it.
 *
 * A documented code carries its documented severity, whichever check reports
 * it. Any other code keeps the check's severity, and one that is not
 * `'incomplete'` — misspelled, or missing — is reported as `invalid`, so the
 * mistake fails closed. Path segments become strings, as the schema's are, so a
 * list index given as a number still covers the schema's failure there.
 */
function normalise(found: DraftIssue): DraftIssue {
  const documented = Object.hasOwn(DRAFT_ISSUE_SEVERITY, found.code)
    ? DRAFT_ISSUE_SEVERITY[found.code as DraftIssueCode]
    : undefined;
  return {
    ...found,
    path: found.path.map(String),
    severity: documented ?? (found.severity === 'incomplete' ? 'incomplete' : 'invalid'),
  };
}

/**
 * Whether a check issue at `reported` accounts for a schema failure at `failed`:
 * at the same path, or inside it. The root is the exception. Every path is inside
 * the root, so a root-level failure is accounted for only by a root-level issue.
 */
function covers(reported: readonly string[], failed: readonly string[]): boolean {
  if (failed.length === 0) {
    return reported.length === 0;
  }
  // Each segment of the failed path matches the reported path at the same
  // position. A failed path longer than the reported one cannot: the reported
  // path runs out, and no segment is ever undefined.
  return failed.every((segment, index) => reported[index] === segment);
}
