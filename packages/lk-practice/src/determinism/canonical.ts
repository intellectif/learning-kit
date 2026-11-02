/**
 * Canonical JSON (design §9): object keys sorted by UTF-16 code unit order,
 * no whitespace, arrays in order, `-0` written as `0`. `NaN`, infinities,
 * `undefined`, functions, symbols, `bigint` values, non-plain objects and
 * circular references are rejected, never silently dropped.
 */

export type CanonicalResult =
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly path: readonly (string | number)[]; readonly message: string };

class CanonicalFailure {
  constructor(
    readonly path: readonly (string | number)[],
    readonly message: string,
  ) {}
}

/** Canonical JSON of `value`, or the path and reason of the first value that has none. */
export function canonicalize(value: unknown): CanonicalResult {
  try {
    return { ok: true, json: write(value, [], new Set()) };
  } catch (error) {
    if (error instanceof CanonicalFailure) {
      return { ok: false, path: error.path, message: error.message };
    }
    throw error;
  }
}

/** Canonical JSON of `value`; throws a `TypeError` naming the path when it has none. */
export function canonicalJson(value: unknown): string {
  const result = canonicalize(value);
  if (!result.ok) {
    throw new TypeError(`canonicalJson: ${result.message} at ${formatPath(result.path)}`);
  }
  return result.json;
}

export function formatPath(path: readonly (string | number)[]): string {
  return path.length === 0 ? '(root)' : path.map(String).join('.');
}

function write(value: unknown, path: (string | number)[], seen: Set<object>): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CanonicalFailure([...path], `${String(value)} is not a finite number`);
      }
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    case 'object':
      if (value === null) return 'null';
      return writeObject(value, path, seen);
    default:
      throw new CanonicalFailure([...path], `a value of type ${typeof value} has no JSON form`);
  }
}

function writeObject(value: object, path: (string | number)[], seen: Set<object>): string {
  if (seen.has(value)) {
    throw new CanonicalFailure([...path], 'a circular reference has no JSON form');
  }
  seen.add(value);
  let out: string;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value)) {
        throw new CanonicalFailure([...path, i], 'an array hole has no JSON form');
      }
      path.push(i);
      parts.push(write(value[i], path, seen));
      path.pop();
    }
    out = `[${parts.join(',')}]`;
  } else {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new CanonicalFailure([...path], 'only plain objects and arrays have a JSON form');
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new CanonicalFailure([...path], 'a symbol key has no JSON form');
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      path.push(key);
      parts.push(`${JSON.stringify(key)}:${write(record[key], path, seen)}`);
      path.pop();
    }
    out = `{${parts.join(',')}}`;
  }
  seen.delete(value);
  return out;
}
