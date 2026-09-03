/**
 * Seeded, deterministic shuffling — the ONE algorithm every presentation-order
 * decision in the SDK goes through: option order in a multiple-choice item,
 * item order inside an item group, entry order in a sequence. A server and a
 * client holding the same seed derive the same order, and an order recorded
 * against an attempt can be rebuilt later from nothing but its seed.
 *
 * STABILITY: the hash and the generator are part of the wire contract. A
 * stored attempt may hold only a seed and rely on this function to reproduce
 * the order it presented; changing either would silently re-order every
 * recorded attempt. Any change here is a package major, and the pinned
 * permutation test exists so an accidental one fails loudly.
 */

/** FNV-1a hash of a string → unsigned 32-bit integer. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * Which draw the Fisher–Yates step uses.
 *
 * - `1` — the original. Takes the index from the LCG's LOW bits (`s % (i+1)`).
 * - `2` — takes it from the HIGH bits. Same LCG, same seed, different draw.
 *
 * The difference is not cosmetic. In a linear congruential generator with a
 * power-of-two modulus, the low bits have drastically short periods: bit 0
 * alternates, bit 1 has period 4, and so on. `% (i+1)` reads exactly those
 * bits, so consecutive draws are correlated and most permutations become
 * unreachable FOR EVERY SEED THAT WILL EVER EXIST:
 *
 * | items | permutations | reachable under v1 | under v2 |
 * | ----- | ------------ | ------------------ | -------- |
 * | 4     | 24           | 12                 | 24       |
 * | 5     | 120          | 60                 | 120      |
 * | 6     | 720          | 180                | 720      |
 *
 * It also biases WHERE an option lands. On a four-option item under v1 the
 * last authored option takes the first presented position 8.3% of the time
 * and the second position 41.7%, against 25% each — a systematic advantage to
 * anyone who notices. For a summative exam that is a fairness defect, not a
 * curiosity.
 *
 * v1 remains the DEFAULT regardless, because these permutations are a wire
 * contract: an attempt may be stored with nothing but its seed, and a review
 * render of that attempt has to reproduce the order the learner actually saw.
 * Switching the default would silently re-order every recorded attempt, so it
 * is a package major — scheduled, not smuggled in. Choose v2 for new content
 * where no attempt has been recorded yet.
 */
export type ShuffleVersion = 1 | 2;

/** Options for {@link seededShuffle}. */
export interface SeededShuffleOptions {
  /** Draw algorithm. Defaults to `1` — see {@link ShuffleVersion}. */
  version?: ShuffleVersion;
}

/** LCG-driven Fisher–Yates over a 32-bit seed; returns a permutation (no loss, no duplicate). */
function shuffleWithSeed<T>(items: readonly T[], seed: number, version: ShuffleVersion): T[] {
  const out = [...items];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    // v1 reads the low bits; v2 scales the whole 32-bit word, which uses the
    // high bits and reaches every permutation.
    const j = version === 2 ? Math.floor((s / 4294967296) * (i + 1)) : s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Returns a new array holding a permutation of `items` determined entirely by
 * `seed` (and the chosen {@link ShuffleVersion}): same inputs, same order —
 * across processes, runtimes and releases. The input is never mutated.
 *
 * Compose the seed from the attempt identity AND the thing being shuffled
 * (`${attemptId}:${itemId}`), so two shuffles in one attempt do not share an
 * order.
 */
export function seededShuffle<T>(
  items: readonly T[],
  seed: string,
  options: SeededShuffleOptions = {},
): T[] {
  return shuffleWithSeed(items, hashSeed(seed), options.version ?? 1);
}
