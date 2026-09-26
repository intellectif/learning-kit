import type { ActivityTypeDescriptor } from './registry.js';

/**
 * Identity helper that gives full type inference when authoring a descriptor:
 *
 * ```ts
 * const myType = defineActivityType<MyTypeData, MyTypeLearnerResponse>({ ... });
 * registerActivityType(myType);
 * ```
 *
 * In a module of its own so the SDK's built-in descriptors can use it without
 * importing the registry they are read into.
 */
export function defineActivityType<TData extends { type: string }, TResponse>(
  descriptor: ActivityTypeDescriptor<TData, TResponse>,
): ActivityTypeDescriptor<TData, TResponse> {
  return descriptor;
}
