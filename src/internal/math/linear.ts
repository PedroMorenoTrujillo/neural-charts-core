import { invalid, ok } from '../diagnostics.js';
import type { Result } from '../diagnostics.js';
import type { Domain } from './domain.js';
import { isFiniteNumber, normalizeZero } from './finite.js';
export interface LinearScale {
  readonly domain: Domain; readonly range: readonly [number, number]; readonly clamp: boolean; readonly invertible: boolean;
  map(value: number): number | null; invert(pixel: number): number | null;
}
function project(x: number, a: number, b: number, r0: number, r1: number, clamp: boolean): number | null {
  if (!isFiniteNumber(x)) return null;
  if (a === b) return null;
  if (x === a) return r0;
  if (x === b) return r1;
  if (clamp) {
    if ((a < b && x < a) || (a > b && x > a)) return r0;
    if ((a < b && x > b) || (a > b && x < b)) return r1;
  }
  const span = b - a, offset = x - a;
  let t = Number.isFinite(span) && Number.isFinite(offset) ? offset / span : (x / 2 - a / 2) / (b / 2 - a / 2);
  if (!Number.isFinite(t)) return null;
  if (clamp) t = Math.max(0, Math.min(1, t));
  const difference = r1 - r0;
  let value = t >= 0 && t <= 1 ? (1 - t) * r0 + t * r1 : Number.isFinite(difference) ? r0 + t * difference : (1 - t) * r0 + t * r1;
  if (!Number.isFinite(value) && Number.isFinite(difference)) value = r0 + t * difference;
  return Number.isFinite(value) ? normalizeZero(value) : null;
}
export function createLinearScale(domain: Domain, range: readonly [number, number], clamp: boolean): Result<LinearScale> {
  if (!Array.isArray(domain) || domain.length !== 2 || !isFiniteNumber(domain[0]) || !isFiniteNumber(domain[1]) || domain[0] >= domain[1]) return invalid('INVALID_DOMAIN', 'REVERSED', 'domain');
  if (!Array.isArray(range) || range.length !== 2 || !isFiniteNumber(range[0]) || !isFiniteNumber(range[1])) return invalid('INVALID_NUMBER', 'NONFINITE', 'range');
  if (typeof clamp !== 'boolean') return invalid('INVALID_CONFIG', 'BAD_CLAMP', 'clamp');
  const [a, b] = domain.map(normalizeZero) as [number, number], [r0, r1] = range.map(normalizeZero) as [number, number];
  return ok(Object.freeze({ domain: Object.freeze([a, b]) as Domain, range: Object.freeze([r0, r1]) as Domain, clamp, invertible: r0 !== r1,
    map: (x: number) => r0 === r1 ? isFiniteNumber(x) ? r0 : null : project(x, a, b, r0, r1, clamp),
    invert: (p: number) => project(p, r0, r1, a, b, clamp) }));
}
