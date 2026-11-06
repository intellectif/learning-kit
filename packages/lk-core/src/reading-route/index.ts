export { type RouteIssue, type RouteIssueCode, routeIssues } from './check.js';
export {
  countParagraphs,
  overlaps,
  passageLayout,
  ROUTE_SEGMENTER,
  sentencesTouching,
} from './layout.js';
export { type PlanRouteOptions, planRoute } from './plan.js';
export {
  markedSentences,
  marksFindEvidence,
  nextRouteLearnerState,
  readRouteLearnerState,
  readRouteTrace,
  routeAnswers,
  routeLevels,
  routePassageFingerprint,
  summarizeRoute,
} from './progress.js';
export { questionKey } from './questions.js';
export { findQuote, type QuoteMatch, quoteText } from './quotes.js';
export {
  isReadingRouteItemType,
  isRouteStrategyId,
  READING_ROUTE_ITEM_TYPES,
  type ReadingRouteItemType,
  ROUTE_NOTE_MAX_LENGTH,
  ROUTE_STRATEGIES,
  ROUTE_STRATEGY_IDS,
  ROUTE_WORD_LIMIT_MAX,
  type RouteStrategy,
} from './strategies.js';
export { routeStepText, routeTrapText } from './text.js';
