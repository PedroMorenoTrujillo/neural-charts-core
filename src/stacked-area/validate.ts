import type { LineChartSpec, LineMountOptions } from '../public/line-types.js';
import type { ChartResult } from '../public/chart-types.js';
import type { StackedAreaChartSpec } from '../public/stacked-area-types.js';
import { validateLine, validateOptions, validateState } from '../line/validate.js';
import { invalid, ok } from '../internal/diagnostics.js';
export { validateState };
export function validateStackedArea<T>(input: unknown): ChartResult<StackedAreaChartSpec<T>> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('INVALID_CONFIG', 'BAD_OBJECT', 'spec');
    const descriptors = Object.getOwnPropertyDescriptors(input), family = descriptors.family, mode = descriptors.stacking;
    if (!family || !('value' in family) || family.value !== 'stacked-area') return invalid('INVALID_CONFIG', 'BAD_FAMILY', 'family');
    if (!mode || !('value' in mode) || !['sum', 'percent'].includes(mode.value)) return invalid('INVALID_CONFIG', 'BAD_STACK_MODE', 'stacking');
    delete descriptors.stacking; descriptors.family = { ...family, value: 'line' };
    const result = validateLine<T>(Object.create(Object.getPrototypeOf(input), descriptors)); if (result.status === 'invalid') return result;
    const spec = result.value;
    if (spec.series.length > 16 || spec.series.reduce((count, series) => count + series.data.length, 0) > 10000 || spec.axes.x.type === 'category' && spec.axes.x.values.length > 10000) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'series');
    if (spec.axes.y.includeZero === false) return invalid('INVALID_CONFIG', 'BASELINE_REQUIRES_ZERO', 'axes.y.includeZero');
    for (let si = 0; si < spec.series.length; si++) {
      const series = spec.series[si]!;
      if (Object.hasOwn(series, 'curve')) return invalid('INVALID_CONFIG', 'UNKNOWN_FIELD', 'series[' + si + '].curve');
      if (series.gaps === 'connect') return invalid('INVALID_CONFIG', 'STACK_REQUIRES_COMPLETE_ROWS', 'series[' + si + '].gaps');
      if (mode.value === 'percent') for (let pi = 0; pi < series.data.length; pi++) if (series.data[pi]!.y !== null && series.data[pi]!.y! < 0) return invalid('INVALID_CONFIG', 'NEGATIVE_PERCENT_VALUE', 'series[' + si + '].data[' + pi + '].y');
    }
    // Validation preserves the X/series/reference tuple; spreading loses that
    // TypeScript correlation but does not change any of its checked members.
    return ok(Object.freeze({ ...spec, family: 'stacked-area', stacking: mode.value as 'sum' | 'percent' }) as StackedAreaChartSpec<T>);
  } catch { return invalid('INVALID_CONFIG', 'BAD_OBJECT', 'spec'); }
}
export function validateStackedAreaOptions<T>(input: unknown, ids: ReadonlySet<string>): ChartResult<LineMountOptions<T>> {
  const result = validateOptions<T>(input); if (result.status === 'invalid' || !result.value.initialState) return result;
  const state = validateState(result.value.initialState, ids, 'options.initialState'); return state.status === 'invalid' ? state : result;
}
