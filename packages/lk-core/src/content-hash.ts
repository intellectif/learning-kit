/**
 * Content fingerprinting — "is this the same content the learner was served?"
 *
 * A recorded attempt outlives the content it was taken against. Papers get
 * corrected, a typo is fixed, an option is reworded — and six months later a
 * remark, an appeal, or a per-item analysis is run against content that is no
 * longer what the learner saw. Nothing warns anybody, because the ids all still
 * match. A fingerprint stored with the attempt turns that silent drift into a
 * question somebody can answer.
 */

/**
 * Deterministic JSON: object keys sorted, arrays left in order, `undefined`
 * omitted from objects (matching `JSON.stringify`) and rendered as `null`
 * inside arrays.
 *
 * Key order is the whole point. Two objects that differ only in the order
 * their keys happened to be written are the SAME content, and a fingerprint
 * that disagreed would raise a false alarm every time a payload made a
 * round-trip through a different serializer.
 */
export function canonicalJson(value: unknown, seen: Set<object> = new Set()): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number') {
    // JSON.stringify renders every non-finite number as `null`, which would
    // fingerprint NaN, Infinity and -Infinity identically — and identically to
    // a real null. Content carrying one of those is already broken; it must at
    // least be distinguishable.
    return Number.isFinite(value) ? JSON.stringify(value === 0 ? 0 : value) : `"#${String(value)}"`;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') {
    return `"#${value.toString()}n"`;
  }
  if (typeof value === 'object') {
    // A cycle would recurse until the stack gave out, and a stack overflow
    // while fingerprinting an exam is a far worse failure than being told the
    // content is not serialisable. Content is JSON, so this should never fire —
    // but "should never" is not a guard.
    if (seen.has(value)) {
      throw new Error(
        'canonicalJson: the value contains a circular reference and cannot be fingerprinted.',
      );
    }
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        return `[${value.map((element) => (element === undefined ? 'null' : canonicalJson(element, seen))).join(',')}]`;
      }
      const source = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(source).sort()) {
        const entry = source[key];
        if (entry === undefined) {
          continue;
        }
        parts.push(`${JSON.stringify(key)}:${canonicalJson(entry, seen)}`);
      }
      return `{${parts.join(',')}}`;
    } finally {
      // Released on the way out, so a value legitimately appearing twice in
      // SIBLING positions is not mistaken for a cycle.
      seen.delete(value);
    }
  }
  // Functions, symbols and undefined have no place in content.
  return 'null';
}

const FNV_OFFSET = 14695981039346656037n;
const FNV_PRIME = 1099511628211n;
const MASK64 = (1n << 64n) - 1n;

/**
 * FNV-1a over the UTF-8 bytes of `input`, as 16 lowercase hex digits.
 *
 * **This is a change-detection fingerprint, not a tamper-evident signature.**
 * It is deterministic across runtimes and dependency-free, which is what makes
 * it usable in a stored grade record — but an adversary who can edit content
 * can also, with effort, preserve the fingerprint. If you need the stronger
 * property, sign the plan with a key the content author does not hold; this
 * exists to catch honest edits, which is what actually happens.
 */
export function fingerprint(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let hash = FNV_OFFSET;
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Fingerprints any JSON-serialisable value through {@link canonicalJson}, so
 * the result depends on the content and not on how it was written.
 */
export function contentHash(value: unknown): string {
  return fingerprint(canonicalJson(value));
}
