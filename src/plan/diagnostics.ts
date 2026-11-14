import { ValidationFailure } from '../internal/data/validation.js';
import type { PlanResult } from '../public/plan-types.js';

type InvalidPlan = Extract<PlanResult, {status: 'invalid'}>;

export function invalidPlan(reason: string, path = 'spec', message = reason): InvalidPlan {
  return {status: 'invalid', diagnostic: {code: 'INVALID_CONFIG', reason, path, message}};
}

export function planningFailure(error: unknown): InvalidPlan {
  return error instanceof ValidationFailure ? {status: 'invalid', diagnostic: error.diagnostic} : invalidPlan('BAD_SPEC');
}
