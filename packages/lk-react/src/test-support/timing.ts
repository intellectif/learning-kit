/**
 * How many times more CPU a call of `work` uses than a call of `baseline`,
 * each measured at its least of `runs`, the two interleaved.
 *
 * For a timing check that holds on any machine. A budget in milliseconds holds
 * only on the machine it was set on, and even a ratio of wall-clock timings
 * failed where four CPUs were shared by the build, the test suites and lint, as
 * on a CI runner: the scheduler holds a process back for tens of milliseconds
 * at a time, and a timing of a few milliseconds either catches such a pause or
 * does not. CPU time leaves the waiting out. Each measurement also repeats its
 * function until it has used `MINIMUM_MS` of CPU and divides by the calls, so
 * it is precise where the system counts process time in ticks of about sixteen
 * milliseconds, as Windows does.
 *
 * To tell linear work from quadratic, give `baseline` the same volume of input
 * as `work`, split into pieces: linear work costs about the same either way,
 * while quadratic work costs about as many times more as there are pieces.
 */
export function slowdown(work: () => unknown, baseline: () => unknown, runs = 3): number {
  let leastWork = Number.POSITIVE_INFINITY;
  let leastBaseline = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run += 1) {
    leastBaseline = Math.min(leastBaseline, cpuPerCall(baseline));
    leastWork = Math.min(leastWork, cpuPerCall(work));
  }
  return leastWork / leastBaseline;
}

/** The CPU a measurement uses at least, in milliseconds. */
const MINIMUM_MS = 100;

/** CPU time in microseconds, as Node's `process.cpuUsage` reports it. */
interface CpuUsage {
  user: number;
  system: number;
}

/**
 * Node's `process`, read off `globalThis`, as `isDevelopment` reads it: the
 * tests run in Node, but this package's type program has no Node types, and
 * its source must not come to rely on them.
 */
const nodeProcess = (
  globalThis as unknown as { process: { cpuUsage(previous?: CpuUsage): CpuUsage } }
).process;

/** The CPU one call of `run` uses, in milliseconds, averaged over calls using `MINIMUM_MS` together. */
function cpuPerCall(run: () => unknown): number {
  const started = nodeProcess.cpuUsage();
  let calls = 0;
  let used = 0;
  do {
    run();
    calls += 1;
    const { user, system } = nodeProcess.cpuUsage(started);
    used = (user + system) / 1000;
  } while (used < MINIMUM_MS);
  return used / calls;
}

/** `part` called `count` times over: the baseline for work split into `count` pieces. */
export const repeatedly = (count: number, part: () => unknown) => (): void => {
  for (let index = 0; index < count; index += 1) {
    part();
  }
};
