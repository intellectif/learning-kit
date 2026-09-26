// The built-in types need no import for its effect: the registry is created
// holding them (see `registry.ts`).
export {
  dictationType,
  fillInTheBlanksType,
  gapSelectType,
  multipleChoiceType,
  readAloudType,
  writtenResponseType,
} from './builtins.js';
export {
  type ActivityTypeAuthoring,
  type ActivityTypeDescriptor,
  type ActivityTypeInterop,
  type ActivityTypeScoring,
  defineActivityType,
  type FieldPolicy,
  getActivityTypeDescriptor,
  type PartialScoringResult,
  type RegisteredActivityTypeDescriptor,
  registerActivityType,
  registeredActivityTypes,
  type Sensitivity,
  type XAPIInteractionType,
} from './registry.js';
