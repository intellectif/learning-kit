export { composeGraph, extensionIssues, isUnderPrefix } from './extension.js';
export {
  DEFAULT_STAGE_DEMAND,
  equivalentStage,
  fallbackDemand,
  type LadderSource,
  ladderOf,
  resolveStageDemand,
  type StageDemandResolution,
} from './stages.js';
export {
  graphStageDemand,
  type ItemGraph,
  itemGraph,
  validateGraph,
  validateItems,
  validateItemsOn,
} from './validate.js';
