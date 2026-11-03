/**
 * FNV-1a 64-bit over the UTF-8 bytes of a string (design §9): offset basis
 * `0xcbf29ce484222325`, prime `0x100000001b3`, modulo 2^64; 16 lowercase hex
 * characters. Not a security hash; used for identity and change detection
 * only. (revised in M8) Computed on two 32-bit halves instead of `BigInt`,
 * several times faster for the rolling log hash (R12.4): the prime is
 * `2^40 + 0x1b3`, so a product is `h * 0x1b3` plus the low half shifted
 * into the high one, each part exact in a double. The result is the same;
 * a test checks it against the `BigInt` form.
 */

import { canonicalJson } from './canonical.js';

const TWO_32 = 0x100000000;
const PRIME_LOW = 0x1b3;

const encoder = new TextEncoder();

export function fnv1a64(input: string): string {
  let high = 0xcbf29ce4;
  let low = 0x84222325;
  for (const byte of encoder.encode(input)) {
    low ^= byte;
    const product = (low >>> 0) * PRIME_LOW;
    const carry = Math.floor(product / TWO_32);
    high = (high * PRIME_LOW + carry + ((low << 8) >>> 0)) % TWO_32;
    low = product % TWO_32;
  }
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}

/** `fnv1a64(canonicalJson(value))`; throws when `value` has no canonical JSON. */
export function hashCanonical(value: unknown): string {
  return fnv1a64(canonicalJson(value));
}
