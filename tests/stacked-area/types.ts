import { createStackedAreaChart, describeStackedArea, type StackedAreaChartSpec, type StackedAreaSeries } from '../../src/stacked-area.js';
declare const host: HTMLElement;
const categories = [{ id: 'a', label: 'Same' }, { id: 'b', label: 'Same' }] as const;
const series: StackedAreaSeries<{ readonly source: string }, string> = { id: 'open', name: 'Open', data: [{ id: 'p', x: 'a', y: 3, datum: { source: 'service' } }] };
const category: StackedAreaChartSpec<{ readonly source: string }> = { family: 'stacked-area', title: 'Workload', stacking: 'sum', axes: { x: { kind: 'category', values: categories }, y: { kind: 'linear' } }, series: [series], labels: 'auto', viewport: { mode: 'internal', axes: 'xy' }, selection: { mode: 'internal', kind: 'multiple' } };
const result = createStackedAreaChart(host, category, { instanceId: 'stacked-area-example', onPointActivate(event) { const source: string | undefined = event.point.datum?.source; void source; } });
if (result.status === 'ok') { result.value.requestViewport({ x: { firstId: 'a', lastId: 'b' } }); result.value.requestSelection([{ seriesId: 'open', pointId: 'p' }]); result.value.update(category); result.value.destroy(); }
const continuous: StackedAreaChartSpec = { family: 'stacked-area', title: 'Percent', stacking: 'percent', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Share', data: [{ id: 'p', x: 3.2, y: 8 }] }] };
describeStackedArea(continuous);
// @ts-expect-error Category X cannot carry numeric points.
const wrongCategory: StackedAreaChartSpec = { ...category, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 2, y: 3 }] }] };
// @ts-expect-error Stacked Area has no connect-gap policy.
const connect: StackedAreaSeries = { id: 's', name: 'S', data: [], gaps: 'connect' };
// @ts-expect-error Smoothing is not silently interpreted as a stacked spline.
const curve: StackedAreaSeries = { id: 's', name: 'S', data: [], curve: 'straight' };
// @ts-expect-error The mode is mandatory.
const noMode: StackedAreaChartSpec = { family: 'stacked-area', title: 'S', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [] };
// @ts-expect-error Percent chart labels use the bounded policy, not a callback.
const formatter: StackedAreaChartSpec = { ...continuous, labels: (value: number) => String(value) };
void [wrongCategory, connect, curve, noMode, formatter];
