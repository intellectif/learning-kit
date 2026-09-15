/**
 * How many times longer `work` takes than `baseline`, each timed at its
 * fastest of `runs`, the two interleaved.
 *
 * For a timing check that holds on any machine. A budget in milliseconds holds
 * only on the machine it was set on: CI runs this suite on a shared runner
 * beside the other packages' builds and lint, several times slower than a
 * development machine, and a render there overran a budget set on one. Two
 * timings taken in the same process leave the machine out of it.
 *
 * To tell linear work from quadratic, give `baseline` the same volume of input
 * as `work`, split into pieces: linear work takes about as long either way,
 * while quadratic work takes about as many times longer as there are pieces.
 * The fastest run of each is the one least disturbed by whatever else the
 * machine was doing, and the first of each pays for compiling what it calls.
 */
export function slowdown(work: () => unknown, baseline: () => unknown, runs = 3): number {
  const time = (run: () => unknown): number => {
    const started = performance.now();
    run();
    return performance.now() - started;
  };
  let fastestWork = Number.POSITIVE_INFINITY;
  let fastestBaseline = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run += 1) {
    fastestBaseline = Math.min(fastestBaseline, time(baseline));
    fastestWork = Math.min(fastestWork, time(work));
  }
  return fastestWork / fastestBaseline;
}

/** `part` called `count` times over: the baseline for work split into `count` pieces. */
export const repeatedly = (count: number, part: () => unknown) => (): void => {
  for (let index = 0; index < count; index += 1) {
    part();
  }
};
