import { invalid, ok } from '../diagnostics.js';
import type { Diagnostic, Result } from '../diagnostics.js';
import { isFiniteNumber, nextDown, nextUp, normalizeZero } from './finite.js';
export type Domain = readonly [number, number];
export type Extent = { readonly status: 'empty' } | { readonly status: 'constant'; readonly value: number }
  | { readonly status: 'span'; readonly domain: Domain } | { readonly status: 'invalid'; readonly diagnostic: Diagnostic };
export type DomainPlan = { readonly status: 'empty' } | { readonly status: 'ok'; readonly domain: Domain; readonly source: 'explicit' | 'auto'; readonly expandedConstant: boolean }
  | { readonly status: 'invalid'; readonly diagnostic: Diagnostic };
export function validDomain(value: unknown): value is Domain {
  return Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]) && value[0] < value[1];
}
export function finiteExtent(values: readonly (number | null)[]): Extent {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null) continue;
    if (!isFiniteNumber(value)) return invalid('INVALID_NUMBER', typeof value === 'number' ? 'NONFINITE' : 'WRONG_TYPE', `values[${i}]`);
    lo = Math.min(lo, value); hi = Math.max(hi, value);
  }
  if (lo === Infinity) return { status: 'empty' };
  lo = normalizeZero(lo); hi = normalizeZero(hi);
  return lo === hi ? { status: 'constant', value: lo } : { status: 'span', domain: Object.freeze([lo, hi]) };
}
export function expandConstant(value: number): Result<Domain> {
  if (!isFiniteNumber(value)) return invalid('INVALID_NUMBER', 'NONFINITE', 'domain');
  const v = normalizeZero(value);
  if (v === 0) return ok(Object.freeze([-1, 1]));
  const delta = Math.abs(v) * 0.05;
  let lo = v - delta, hi = v + delta;
  if (!Number.isFinite(lo)) lo = v;
  if (!Number.isFinite(hi)) hi = v;
  if (lo === v) { const n = nextDown(v); if (Number.isFinite(n)) lo = n; }
  if (hi === v) { const n = nextUp(v); if (Number.isFinite(n)) hi = n; }
  return lo < hi ? ok(Object.freeze([normalizeZero(lo), normalizeZero(hi)])) : invalid('INVALID_DOMAIN', 'UNREPRESENTABLE', 'domain');
}
export function normalizeNumericDomain(extent: Extent, options: { readonly explicit?: Domain; readonly includeZero: boolean }): DomainPlan {
  if (typeof options.includeZero !== 'boolean') return invalid('INVALID_CONFIG', 'BAD_INCLUDE_ZERO', 'includeZero');
  if ('explicit' in options && !validDomain(options.explicit)) return invalid('INVALID_DOMAIN', options.explicit?.[0] === options.explicit?.[1] ? 'CONSTANT_EXPLICIT' : 'REVERSED', 'explicit');
  if (extent.status === 'invalid') return extent;
  if (options.explicit) return { status: 'ok', source: 'explicit', expandedConstant: false, domain: Object.freeze([...options.explicit]) as Domain };
  if (extent.status === 'empty') return extent;
  let lo = extent.status === 'constant' ? extent.value : extent.domain[0];
  let hi = extent.status === 'constant' ? extent.value : extent.domain[1];
  if (options.includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (lo === hi) {
    const expanded = expandConstant(lo);
    return expanded.status === 'invalid' ? expanded : { status: 'ok', source: 'auto', expandedConstant: true, domain: expanded.value };
  }
  if (!validDomain([lo, hi])) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE', 'extent');
  return { status: 'ok', source: 'auto', expandedConstant: false, domain: Object.freeze([normalizeZero(lo), normalizeZero(hi)]) };
}
