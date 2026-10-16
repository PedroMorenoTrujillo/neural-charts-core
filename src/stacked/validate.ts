import type { ColumnChartSpec } from '../public/column-types.js';
import type { ChartResult } from '../public/chart-types.js';
import { validateColumn } from '../column/validate.js';
import { invalid, ok } from '../internal/diagnostics.js';
export type StackedInternalSpec<T> = ColumnChartSpec<T> & Readonly<{ stacking: 'sum' | 'percent' }>;
export function validateStacked<T>(input: unknown): ChartResult<StackedInternalSpec<T>> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('INVALID_CONFIG', 'BAD_OBJECT', 'spec');
    const descriptors = Object.getOwnPropertyDescriptors(input), family = descriptors.family, mode = descriptors.stacking;
    if (!family || !('value' in family) || family.value !== 'stacked') return invalid('INVALID_CONFIG', 'BAD_FAMILY', 'family');
    if (!mode || !('value' in mode) || !['sum', 'percent'].includes(mode.value)) return invalid('INVALID_CONFIG', 'BAD_STACK_MODE', 'stacking');
    if (Object.hasOwn(descriptors, 'barGap')) return invalid('INVALID_CONFIG', 'UNKNOWN_FIELD', 'barGap');
    delete descriptors.stacking; descriptors.family = { ...family, value: 'column' };
    const checked = validateColumn<T>(Object.create(Object.getPrototypeOf(input), descriptors));
    if (checked.status === 'invalid') return checked;
    if (mode.value === 'percent') {
      for (let si = 0; si < checked.value.series.length; si++) for (let pi = 0; pi < checked.value.series[si]!.data.length; pi++) {
        const point = checked.value.series[si]!.data[pi]!;
        if (point.y !== null && point.y < 0) return invalid('INVALID_CONFIG', 'NEGATIVE_PERCENT_VALUE', 'series[' + si + '].data[' + pi + '].y');
      }
    }
    const spec = checked.value, axes = mode.value === 'percent' && !spec.axes.y.title ? Object.freeze({ ...spec.axes, y: Object.freeze({ ...spec.axes.y, title: 'Percent of visible total' }) }) : spec.axes;
    return ok(Object.freeze({ ...spec, axes, stacking: mode.value as 'sum' | 'percent' }));
  } catch { return invalid('INVALID_CONFIG', 'BAD_OBJECT', 'spec'); }
}
export function stackMode<T>(spec: ColumnChartSpec<T>): 'sum' | 'percent' { return (spec as StackedInternalSpec<T>).stacking; }
