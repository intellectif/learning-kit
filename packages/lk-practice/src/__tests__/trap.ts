import { vi } from 'vitest';

/**
 * The runtime purity trap (R1.1): the clock, the random source and argument-
 * less `new Date()` replaced by functions that throw. Shared by the purity
 * test and the vector replay (revised in M8); `scripts/verify-dist.mjs` sets
 * the same trap around the build.
 */
export class PurityViolation extends Error {
  constructor(source: string) {
    super(`lk-practice reached ${source}, which it must never call.`);
    this.name = 'PurityViolation';
  }
}

const RealDate = Date;

/** `Date` with a date given still works; the current time does not. */
class TrappedDate extends RealDate {
  constructor(...args: [] | [value: number | string | Date]) {
    if (args.length === 0) {
      throw new PurityViolation('new Date()');
    }
    super(args[0]);
  }

  static override now(): number {
    throw new PurityViolation('Date.now()');
  }
}

export function installTrap(): void {
  vi.stubGlobal('Date', TrappedDate);
  vi.spyOn(Math, 'random').mockImplementation(() => {
    throw new PurityViolation('Math.random()');
  });
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
    throw new PurityViolation('crypto.randomUUID()');
  });
}

export function removeTrap(): void {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}
