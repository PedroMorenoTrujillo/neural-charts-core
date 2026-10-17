import type { ChartResult } from '../public/chart-types.js';
import type { GaugeChartSpec, GaugeDescription } from '../public/gauge-types.js';
import { ok } from '../internal/diagnostics.js';
import { validateGauge } from './validate.js';
export const gaugeColumns = Object.freeze(['Kind', 'Label', 'Original value', 'From', 'To', 'Unit', 'Range state']);
export function gaugeRange(value: number | null, domain: readonly [number, number]): string { return value === null ? 'No measurement' : value < domain[0] ? 'Below domain' : value > domain[1] ? 'Above domain' : 'Within domain'; }
export function gaugeValue(spec: GaugeChartSpec): string { return spec.value === null ? 'No measurement' : String(spec.value) + (spec.unit ? ' ' + spec.unit : ''); }
export function gaugeRows(spec: GaugeChartSpec): readonly (readonly (string | number | null)[])[] {
  return [[ 'measurement', spec.title, spec.value, spec.domain[0], spec.domain[1], spec.unit ?? '', gaugeRange(spec.value, spec.domain) ], ...(spec.target ? [[ 'target', spec.target.label ?? 'Target', spec.target.value, null, null, spec.unit ?? '', gaugeRange(spec.target.value, spec.domain) ]] : []), ...(spec.bands ?? []).map(band => [ 'band', band.label ?? band.id, null, band.from, band.to, spec.unit ?? '', '' ])];
}
export function describeGaugeSpec(spec: GaugeChartSpec): GaugeDescription {
  const view = spec.status?.kind ?? 'ready', status = spec.status && 'message' in spec.status && spec.status.message ? spec.status.message : view === 'loading' ? 'Loading measurement.' : view === 'error' ? 'Measurement unavailable.' : view === 'empty' ? 'No measurement.' : '';
  const context = gaugeValue(spec) + '. ' + gaugeRange(spec.value, spec.domain) + '. Domain ' + spec.domain[0] + ' to ' + spec.domain[1] + '. ' + (spec.target ? (spec.target.label ?? 'Target') + ': ' + spec.target.value + (spec.unit ? ' ' + spec.unit : '') + '. ' + gaugeRange(spec.target.value, spec.domain) + '. ' : '') + 'The arc is limited to the domain. Original values are retained in this description and the data table. Read-only indicator; not an input.';
  return Object.freeze({ title: spec.title, description: spec.description ?? '', direction: spec.direction ?? 'ltr', view, status, context, table: Object.freeze({ columns: gaugeColumns, rows: Object.freeze(gaugeRows(spec).map((row, index) => Object.freeze({ key: index === 0 ? 'measurement' : 'record:' + index, cells: Object.freeze(row.map(cell => cell === null ? 'Not supplied' : String(cell))) }))) }) });
}
export function describeGauge(input: unknown): ChartResult<GaugeDescription> { const parsed = validateGauge(input); return parsed.status === 'invalid' ? parsed : ok(describeGaugeSpec(parsed.value)); }
