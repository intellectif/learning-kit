import { matchSupportsInAnswer } from '../underline.js';
export interface AnswerSegment {
  text: string;
  underline: boolean;
  start: number;
}
export function answerSegments(answer: string, supports: readonly string[]): AnswerSegment[] {
  const result: AnswerSegment[] = [];
  let from = 0;
  for (const match of matchSupportsInAnswer(answer, supports).sort((a, b) => a.start - b.start)) {
    if (match.start > from)
      result.push({ text: answer.slice(from, match.start), underline: false, start: from });
    result.push({
      text: answer.slice(match.start, match.end),
      underline: true,
      start: match.start,
    });
    from = match.end;
  }
  if (from < answer.length)
    result.push({ text: answer.slice(from), underline: false, start: from });
  return result;
}
