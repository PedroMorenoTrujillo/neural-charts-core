import type { LineChartSpec } from '../../src/line.js';
import type { SplineChartSpec } from '../../src/spline.js';
import type { AreaChartSpec } from '../../src/area.js';
import type { ColumnChartSpec } from '../../src/column.js';
import type { StackedChartSpec } from '../../src/stacked.js';
import { createLineChart } from '../../src/line.js';
// Keep the executable Core guide example compiled against public entrypoints.
export function createLabeledRevenue(host: HTMLElement) {
  return createLineChart(host, {
    family: 'line', title: 'Monthly revenue', labels: 'auto',
    axes: { x: { kind: 'category', values: [{ id: 'jan', label: 'January' }, { id: 'feb', label: 'February' }] }, y: { kind: 'linear' } },
    series: [{ id: 'revenue', name: 'Revenue', data: [{ id: 'jan-revenue', x: 'jan', y: 12 }, { id: 'feb-revenue', x: 'feb', y: 18 }] }],
  }, { instanceId: 'monthly-revenue' });
}
const line = { family: 'line', title: 'Labels', axes: { x: { kind: 'category', values: [] }, y: { kind: 'linear' } }, series: [], labels: 'auto' } as const satisfies LineChartSpec;
const spline = { ...line, family: 'spline' } as const satisfies SplineChartSpec;
const area = { ...line, family: 'area' } as const satisfies AreaChartSpec;
const column = { ...line, family: 'column', labels: 'off' } as const satisfies ColumnChartSpec;
const stacked = { ...column, family: 'stacked', stacking: 'percent', labels: 'auto' } as const satisfies StackedChartSpec;
// @ts-expect-error Cartesian labels do not expose radial placement semantics.
const outside = { ...line, labels: 'outside' } satisfies LineChartSpec;
// @ts-expect-error Boolean synonyms are not a second public off contract.
const disabled = { ...column, labels: false } satisfies ColumnChartSpec;
// @ts-expect-error No callback formatter or DOM event enters the public model.
const formatter = { ...area, labels: () => 'value' } satisfies AreaChartSpec;
void [line, spline, area, column, stacked, outside, disabled, formatter];
