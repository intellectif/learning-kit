export interface SupportMatch {
  support: string;
  start: number;
  end: number;
}

/**
 * Every place a support item occurs verbatim in the sample answer, in answer
 * order. Overlaps are resolved by list order: an earlier item keeps the
 * characters it underlines, and a later item cannot claim them.
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
      if (claimed.slice(start, end).some(Boolean)) {
        from = start + 1;
        continue;
      }
      for (let i = start; i < end; i += 1) {
        claimed[i] = true;
      }
      matches.push({ support, start, end });
      from = end;
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}
