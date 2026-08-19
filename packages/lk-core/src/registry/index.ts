// Importing builtins registers the three built-in activity types on the
// default registry as a module-evaluation effect. Every registry consumer
// (validateActivity, score, evaluate, redact, jsonSchemaFor) imports THIS
// barrel, so built-ins are always registered before any lookup.
import './builtins.js';

export { fillInTheBlanksType, multipleChoiceType, writtenResponseType } from './builtins.js';
export {
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
