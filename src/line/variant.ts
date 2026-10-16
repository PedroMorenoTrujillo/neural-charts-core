import type { ChartResult } from '../public/chart-types.js';
import type { LineChartSpec } from '../public/line-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { validateLine } from './validate.js';

/** Preserve descriptors/prototype so changing the family cannot launder an
 * accessor, symbol, non-enumerable field or foreign record past validation. */
export function validateVariant<T>(value: unknown, family: 'spline' | 'area'): ChartResult<LineChartSpec<T>> {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('INVALID_CONFIG', 'BAD_OBJECT', '');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const source = descriptors.family;
    if (!source || !('value' in source) || source.value !== family) return invalid('INVALID_CONFIG', 'BAD_FAMILY', 'family');
    descriptors.family = { ...source, value: 'line' };
    const line = Object.create(Object.getPrototypeOf(value), descriptors) as unknown;
    const checked = validateLine<T>(line);
    if (checked.status === 'invalid') return checked;
    if (family === 'spline') {
      const index = checked.value.series.findIndex(series => Object.hasOwn(series, 'curve'));
      if (index >= 0) return invalid('INVALID_CONFIG', 'UNKNOWN_FIELD', 'series[' + index + '].curve');
      return checked;
    }
    if (checked.value.axes.y.includeZero === false) return invalid('INVALID_CONFIG', 'BASELINE_REQUIRES_ZERO', 'axes.y.includeZero');
    // The X discriminant, series and references remain the same validated tuple;
    // TypeScript loses that correlation while spreading the nested axes union.
    return ok(Object.freeze({ ...checked.value, axes: Object.freeze({ ...checked.value.axes, y: Object.freeze({ ...checked.value.axes.y, includeZero: true }) }) }) as LineChartSpec<T>);
  } catch { return invalid('INVALID_CONFIG', 'BAD_OBJECT', ''); }
}
