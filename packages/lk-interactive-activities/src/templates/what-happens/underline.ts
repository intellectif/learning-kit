export interface SupportMatch {
  support: string;
  start: number;
  end: number;
}

/**
 * Support items that occur verbatim in the sample answer, in list order.
 * Overlapping matches are resolved first-wins, so later items cannot claim
 * characters an earlier item already underlined.
 */
export function matchSupportsInAnswer(answer: string, supports: readonly string[]): SupportMatch[] {
  const claimed = Array<boolean>(answer.length).fill(false);
  const matches: SupportMatch[] = [];

  for (const support of supports) {
    if (support.length === 0) {
      continue;
    }
    let from = 0;
    while (from <= answer.length - support.length) {
      const start = answer.indexOf(support, from);
      if (start === -1) {
        break;
      }
      const end = start + support.length;
      const overlaps = claimed.slice(start, end).some(Boolean);
      if (!overlaps) {
        for (let i = start; i < end; i += 1) {
          claimed[i] = true;
        }
        matches.push({ support, start, end });
        break;
      }
      from = start + 1;
    }
  }

  return matches;
}
