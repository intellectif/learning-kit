/**
 * The package's one error class with issues (design §5.9): thrown where a
 * function is called with a configuration it cannot use, so a host can tell
 * a configuration mistake from bad input data.
 */

import type { Issue } from './types.js';

/** A configuration that the called function cannot use; `issues` say why, with stable codes. */
export class PracticeConfigError extends Error {
  readonly issues: readonly Issue[];

  constructor(issues: readonly Issue[]) {
    super(`lk-practice: ${issues.map((issue) => issue.message).join(' ')}`);
    this.name = 'PracticeConfigError';
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
  }
}
