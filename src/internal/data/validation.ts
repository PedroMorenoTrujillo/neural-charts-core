import type { ChartDiagnostic } from '../../public/chart-types.js';
import { invalid } from '../diagnostics.js';
export type RecordValue = Record<string, unknown>;
export class ValidationFailure { constructor(readonly diagnostic: ChartDiagnostic) {} }
export function fail(path: string, reason = 'BAD_SPEC', code: ChartDiagnostic['code'] = 'INVALID_CONFIG'): never { throw new ValidationFailure(invalid(code, reason, path).diagnostic); }
export function record(value: unknown, allowed: readonly string[], required: readonly string[], path: string, opaque: readonly string[] = []): RecordValue {
  if (!value || typeof value !== 'object' || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) fail(path);
  const result: RecordValue = Object.create(null) as RecordValue;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) fail(path + '.' + String(key));
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined && !opaque.includes(key)) fail(path + '.' + key);
    result[key] = descriptor.value;
  }
  for (const key of required) if (!Object.hasOwn(result, key)) fail(path + '.' + key);
  return result;
}
export function array(value: unknown, cap: number, path: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(path);
  if (value.length > cap) fail(path, 'RESOURCE_LIMIT');
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')) fail(path);
  }
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) fail(path + '[' + i + ']');
  return value;
}
export function text(value: unknown, path: string, max = 256, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.length) || value.length > max) fail(path);
  return value;
}
export function number(value: unknown, path: string, minimum = -Infinity, maximum = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'NONFINITE', 'INVALID_NUMBER');
  if (value < minimum || value > maximum) fail(path); return value === 0 ? 0 : value;
}
export function choice<T extends string | number>(value: unknown, choices: readonly T[], path: string): T {
  if (!choices.includes(value as T)) fail(path); return value as T;
}
export function color(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) fail(path, 'BAD_COLOR');
  return value.toLowerCase();
}
export function optional(target: RecordValue, key: string, check: (value: unknown, path: string) => unknown, path: string): void {
  if (Object.hasOwn(target, key)) target[key] = check(target[key], path + '.' + key);
}
