import { readFileSync } from 'node:fs';
import type { Result } from '../src/internal/diagnostics.js';
export function value<T>(result: Result<T>): T {
  if (result.status === 'invalid') throw new Error(JSON.stringify(result.diagnostic));
  return result.value;
}
export const fixture = (name: string): any => JSON.parse(readFileSync(new URL(`./fixtures/math/${name}.json`, import.meta.url), 'utf8'));
export function special(value: any): any {
  if (!value || typeof value !== 'object' || !value.special) return value;
  return ({ NaN: NaN, Infinity: Infinity, '-Infinity': -Infinity, '-0': -0, MIN_VALUE: Number.MIN_VALUE, MAX_VALUE: Number.MAX_VALUE } as Record<string, number>)[value.special];
}
