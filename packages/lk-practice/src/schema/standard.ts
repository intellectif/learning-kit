/**
 * Standard Schema (design §5.9, R8.2, R10.1) (M7). `StandardSchemaV1` is a
 * structural copy of the Standard Schema v1 interface (standardschema.dev),
 * so the package needs no dependency for it: a validator library that reads
 * Standard Schema accepts the package's schema objects as they are.
 *
 * One deliberate difference from the spec's text: the failure issue is the
 * top-level `StandardSchemaIssue`, not a namespace member named `Issue`. The
 * type bundler treats a namespace member as a top-level name, so a member
 * `Issue` renamed the package's own `Issue` to `Issue$1` in every published
 * signature. The shape is the spec's, and Standard Schema is matched by shape.
 * `standardSchema` wraps one of the package's total checks.
 */

import type { CheckResult, Issue } from '../types.js';

/** One issue of a Standard Schema failure: the spec's `StandardSchemaV1.Issue`, by shape. */
export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment> | undefined;
}

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }

  export type Result<Output> = SuccessResult<Output> | FailureResult;

  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  export interface FailureResult {
    readonly issues: ReadonlyArray<StandardSchemaIssue>;
  }

  export interface PathSegment {
    readonly key: PropertyKey;
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
}

/** The vendor name the package's schema objects report. */
export const VENDOR = 'lk-practice';

/**
 * A Standard Schema over a total check. `validate` is synchronous; a failure
 * keeps each issue's stable `code` beside the Standard Schema `message` and
 * `path`.
 */
export function standardSchema<T>(
  check: (value: unknown) => CheckResult<T>,
): StandardSchemaV1<unknown, T> {
  return Object.freeze({
    '~standard': Object.freeze({
      version: 1 as const,
      vendor: VENDOR,
      validate: (value: unknown): StandardSchemaV1.Result<T> => {
        const result = check(value);
        if (result.ok) return { value: result.value };
        return { issues: result.issues.map(toStandardIssue) };
      },
    }),
  });
}

function toStandardIssue(issue: Issue): StandardSchemaIssue & { readonly code: string } {
  return { code: issue.code, message: issue.message, path: [...issue.path] };
}
