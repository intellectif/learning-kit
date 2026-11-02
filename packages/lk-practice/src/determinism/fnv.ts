/**
 * FNV-1a 64-bit over the UTF-8 bytes of a string (design §9): offset basis
 * `0xcbf29ce484222325`, prime `0x100000001b3`, computed with `BigInt` and
 * masked to 64 bits; 16 lowercase hex characters. Not a security hash; used
 * for identity and change detection only.
 */

import { canonicalJson } from './canonical.js';

const OFFSET_BASIS = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

const encoder = new TextEncoder();

export function fnv1a64(input: string): string {
  let hash = OFFSET_BASIS;
  for (const byte of encoder.encode(input)) {
    hash = ((hash ^ BigInt(byte)) * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/** `fnv1a64(canonicalJson(value))`; throws when `value` has no canonical JSON. */
export function hashCanonical(value: unknown): string {
  return fnv1a64(canonicalJson(value));
}
