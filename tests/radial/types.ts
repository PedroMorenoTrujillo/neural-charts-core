import { createPieChart, describePie } from '../../src/pie.js';
import { createDonutChart } from '../../src/donut.js';
import type { PieChartSpec, PieSlice } from '../../src/pie.js';
import type { DonutChartSpec } from '../../src/donut.js';
type Sku = Readonly<{ sku: string }>;
declare const host: HTMLElement;
const data: readonly PieSlice<Sku>[] = [{ id: 'a', label: 'A', value: 2, datum: { sku: 'original' } }];
const pie: PieChartSpec<Sku> = { family: 'pie', title: 'Contribution', data };
const result = createPieChart(host, pie, { instanceId: 'pie', onPointActivate(event) {
  event.point.datum?.sku.toUpperCase(); const share: number | null = event.percentage; void share;
  // @ts-expect-error Slice activation is not an invented Cartesian series event.
  event.seriesId;
} });
if (result.status === 'ok') {
  result.value.update({ ...pie, labels: 'inside' });
  // @ts-expect-error Visibility snapshots are immutable.
  result.value.getState().hiddenSliceIds.push('a');
  // @ts-expect-error A Pie controller cannot switch into another public family.
  result.value.update({ ...pie, family: 'donut' });
}
const donut: DonutChartSpec<Sku> = { ...pie, family: 'donut', holeRatio: .6, center: { label: 'Contribution', value: 'Current' } };
createDonutChart(host, donut, { instanceId: 'donut' });
describePie(pie);
// @ts-expect-error Pie has no inner hole or center options.
createPieChart(host, { ...pie, holeRatio: .6 }, { instanceId: 'wrong' });
// @ts-expect-error Radial data do not use a fictitious X/Y datum.
createPieChart(host, { ...pie, data: [{ id: 'x', label: 'X', x: 1, y: 2 }] }, { instanceId: 'wrong' });
// @ts-expect-error Slice visibility has its own domain identity.
createPieChart(host, { ...pie, state: { mode: 'controlled', value: { hiddenSeriesIds: [] } } }, { instanceId: 'wrong' });
// @ts-expect-error A ratio is numeric, not a CSS percentage.
createDonutChart(host, { ...donut, holeRatio: '60%' }, { instanceId: 'wrong' });
// @ts-expect-error Domain input arrays are immutable.
pie.data.push({ id: 'b', label: 'B', value: 3 });
