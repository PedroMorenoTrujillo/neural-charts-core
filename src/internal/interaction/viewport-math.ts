import type { ChartResult } from '../../public/chart-types.js';
import type { Domain } from '../math/domain.js';
import { createLinearScale } from '../math/linear.js';
import { invalid, ok } from '../diagnostics.js';
const domain = (value: Domain): boolean => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[0] < value[1];
function validate(current: Domain, full: Domain): ChartResult<void> {
  return domain(current) && domain(full) && current[0] >= full[0] && current[1] <= full[1] ? ok(undefined) : invalid('INVALID_DOMAIN', 'BAD_VIEWPORT', 'viewport');
}
function owned(low: number, high: number): ChartResult<Domain> { return Number.isFinite(low) && Number.isFinite(high) && low < high ? ok(Object.freeze([low === 0 ? 0 : low, high === 0 ? 0 : high] as const)) : invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_VIEWPORT', 'viewport'); }
export function zoomNumeric(current: Domain, full: Domain, factor: number, anchor = .5): ChartResult<Domain> {
  const checked = validate(current, full); if (checked.status === 'invalid') return checked;
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(anchor) || anchor < 0 || anchor > 1) return invalid('INVALID_CONFIG', 'BAD_ZOOM', 'viewport');
  const scale = createLinearScale(current, [0, 1], false); if (scale.status === 'invalid') return scale;
  // Contracting in the current domain retains tiny windows that could collapse
  // if first normalized against a vastly larger full-data domain.
  const low = scale.value.invert(anchor - anchor / factor), high = scale.value.invert(anchor + (1 - anchor) / factor);
  if (factor >= 1) return low !== null && high !== null ? owned(low, high) : invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_VIEWPORT', 'viewport');
  const clampedLow = Math.max(full[0], low ?? full[0]), clampedHigh = Math.min(full[1], high ?? full[1]);
  return owned(clampedLow, clampedHigh);
}
export function panNumeric(current: Domain, full: Domain, delta: number): ChartResult<Domain> {
  const checked = validate(current, full); if (checked.status === 'invalid') return checked;
  if (!Number.isFinite(delta)) return invalid('INVALID_CONFIG', 'BAD_PAN', 'viewport');
  // Translating in the current window preserves small, representable spans
  // inside a much larger full domain; full-domain normalization can collapse
  // both endpoints to one floating-point value before any movement occurs.
  if (delta === 0) return owned(current[0], current[1]);
  const scale = createLinearScale(current, [0, 1], false); if (scale.status === 'invalid') return scale;
  let low = scale.value.invert(delta), high = scale.value.invert(1 + delta);
  if (delta < 0 && (low === null || low < full[0])) {
    const start = scale.value.map(full[0]); low = full[0]; high = start === null ? null : scale.value.invert(start + 1);
  } else if (delta > 0 && (high === null || high > full[1])) {
    const end = scale.value.map(full[1]); high = full[1]; low = end === null ? null : scale.value.invert(end - 1);
  }
  return low !== null && high !== null && low >= full[0] && high <= full[1] ? owned(low, high) : invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_VIEWPORT', 'viewport');
}
/** Epoch windows pan by one rounded translation (ties away from zero). Rounding
 * each endpoint outward would stretch a1ms window. Clamp a common translation;
 * correct its endpoint rounding at the date extremes without subtracting a
 * potentially unsafe-width scalar from an epoch. No BigInt runtime is needed. */
export function panTime(current: Domain, full: Domain, delta: number): ChartResult<Domain> {
  const checked = validate(current, full); if (checked.status === 'invalid') return checked;
  if (![...current, ...full].every(Number.isSafeInteger) || full[0] < -8640000000000000 || full[1] > 8640000000000000) return invalid('INVALID_DOMAIN', 'BAD_VIEWPORT', 'viewport');
  if (!Number.isFinite(delta)) return invalid('INVALID_CONFIG', 'BAD_PAN', 'viewport');
  const requested = delta * (current[1] - current[0]), rounded = Math.sign(requested) * Math.round(Math.abs(requested));
  const shift = Math.max(full[0] - current[0], Math.min(full[1] - current[1], rounded));
  let low = current[0] + shift, high = current[1] + shift;
  if (low < full[0]) { high += full[0] - low; low = full[0]; }
  if (high > full[1]) { low -= high - full[1]; high = full[1]; }
  return low >= full[0] && high <= full[1] && Number.isSafeInteger(low) && Number.isSafeInteger(high) ? owned(low, high) : invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_VIEWPORT', 'viewport');
}
export type CategoryWindow = Readonly<{ firstId: string; lastId: string }>;
function categoryRange(current: CategoryWindow, ids: readonly string[], ranks: ReadonlyMap<string, number>): ChartResult<readonly [number, number]> {
  const low = ranks.get(current.firstId), high = ranks.get(current.lastId);
  return ids.length && low !== undefined && high !== undefined && low >= 0 && high >= low && high < ids.length && ids[low] === current.firstId && ids[high] === current.lastId ? ok([low, high] as const) : invalid('INVALID_CONFIG', 'BAD_CATEGORY_WINDOW', 'viewport.x');
}
export function zoomCategory(current: CategoryWindow, ids: readonly string[], ranks: ReadonlyMap<string, number>, factor: number, anchor = .5): ChartResult<CategoryWindow> {
  const range = categoryRange(current, ids, ranks); if (range.status === 'invalid') return range;
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(anchor) || anchor < 0 || anchor > 1) return invalid('INVALID_CONFIG', 'BAD_ZOOM', 'viewport.x');
  const count = range.value[1] - range.value[0] + 1, next = Math.max(1, Math.min(ids.length, Math.ceil(count / factor))), first = Math.max(0, Math.min(ids.length - next, Math.floor(range.value[0] + anchor * count - anchor * next)));
  return ok(Object.freeze({ firstId: ids[first]!, lastId: ids[first + next - 1]! }));
}
export function panCategory(current: CategoryWindow, ids: readonly string[], ranks: ReadonlyMap<string, number>, delta: number): ChartResult<CategoryWindow> {
  const range = categoryRange(current, ids, ranks); if (range.status === 'invalid') return range;
  if (!Number.isFinite(delta)) return invalid('INVALID_CONFIG', 'BAD_PAN', 'viewport.x');
  const count = range.value[1] - range.value[0] + 1, first = Math.max(0, Math.min(ids.length - count, range.value[0] + Math.round(delta * count)));
  return ok(Object.freeze({ firstId: ids[first]!, lastId: ids[first + count - 1]! }));
}
