import type { ChartResult } from '../public/chart-types.js';
import type { MixedChartSpec, MixedMountOptions, MixedSeries } from '../public/mixed-types.js';
import { record, array, number, choice, fail, ValidationFailure } from '../internal/data/validation.js';
import { validateLine } from '../line/validate.js';
import { validateColumnOptions } from '../column/validate.js';
import { ok, invalid } from '../internal/diagnostics.js';
/** Descriptor-safe structural projection delegates existing Cartesian validation,
 * not its public controller. Mixed owns the discriminants and column limits. */
export function validateMixed<T>(input: unknown): ChartResult<MixedChartSpec<T>> {
  try {
    const source = record(input, ['family', 'title', 'description', 'series', 'axes', 'groupGap', 'barGap', 'maxBarWidth', 'theme', 'direction', 'font', 'status', 'state', 'legend', 'tooltip', 'references', 'referenceBands', 'selection', 'crosshair', 'motion', 'labels', 'viewport'], ['family', 'title', 'series', 'axes'], 'spec');
    choice(source.family, ['mixed'], 'family');
    const axes = record(source.axes, ['x', 'y'], ['x', 'y'], 'axes'), x = record(axes.x, ['type', 'values', 'title', 'grid', 'ticks', 'labels'], ['type', 'values'], 'axes.x'); choice(x.type, ['category'], 'axes.x.type'); array(x.values, 10000, 'axes.x.values');
    const kinds: MixedSeries<T>['type'][] = []; let points = 0;
    const series = array(source.series, 16, 'series').map((value, i) => {
      const path = 'series[' + i + ']', item = record(value, ['type', 'id', 'name', 'data', 'color', 'curve', 'gaps', 'markers', 'dash'], ['type', 'id', 'name', 'data'], path), type = choice(item.type, ['line', 'area', 'column'], path + '.type'); kinds.push(type);
      points += array(item.data, 10000, path + '.data').length; if (points > 10000) fail('series', 'RESOURCE_LIMIT');
      if (type === 'column') for (const key of ['curve', 'gaps', 'markers', 'dash']) if (Object.hasOwn(item, key)) fail(path + '.' + key, 'COLUMN_OPTION');
      const { type: _kind, ...line } = item; return line;
    });
    const { groupGap, barGap, maxBarWidth, ...common } = source;
    if (Object.hasOwn(source, 'groupGap')) number(groupGap, 'groupGap', 0, .95);
    if (Object.hasOwn(source, 'barGap')) number(barGap, 'barGap', 0, 1);
    if (Object.hasOwn(source, 'maxBarWidth')) number(maxBarWidth, 'maxBarWidth', .25, 1024);
    const checked = validateLine<T>({ ...common, family: 'line', axes: { ...axes, x }, series }); if (checked.status === 'invalid') return checked;
    if (checked.value.axes.x.type !== 'category') return invalid('INTERNAL_INVARIANT', 'BAD_MIXED_AXIS', 'axes.x');
    if (kinds.some(type => type !== 'line') && checked.value.axes.y.includeZero === false) fail('axes.y.includeZero', 'BASELINE_ZERO_REQUIRED');
    const result = { ...checked.value, family: 'mixed', series: Object.freeze(checked.value.series.map((item, i) => Object.freeze({ ...item, type: kinds[i]! }))), ...(groupGap === undefined ? {} : { groupGap }), ...(barGap === undefined ? {} : { barGap }), ...(maxBarWidth === undefined ? {} : { maxBarWidth }) };
    return ok(Object.freeze(result) as MixedChartSpec<T>);
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_MIXED_SPEC', 'spec'); }
}
export function validateMixedOptions<T>(input: unknown, ids: ReadonlySet<string>): ChartResult<MixedMountOptions<T>> {
  // Same finite option keys and hidden-series ownership; callback values are
  // functions only at this boundary and receive Mixed events from its policy.
  const result = validateColumnOptions<T>(input, ids); return result.status === 'invalid' ? result : ok(result.value as MixedMountOptions<T>);
}
