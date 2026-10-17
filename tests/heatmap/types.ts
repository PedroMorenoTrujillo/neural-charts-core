import { createHeatmapChart } from '../../src/heatmap.js';
import type { HeatmapChartSpec, HeatmapViewportValue, ChartColorStop } from '../../src/heatmap.js';
declare const host: HTMLElement;
const spec: HeatmapChartSpec<{ source: string }> = { family: 'heatmap', title: 'Measurements', axes: { x: { kind: 'category', values: [{ id: 'x' }] }, y: { kind: 'category', values: [{ id: 'y' }] } }, data: [{ id: 'observed', rowId: 'y', columnId: 'x', value: 0, datum: { source: 'raw' } }] };
createHeatmapChart(host, spec, { instanceId: 'typed-heatmap', onPointActivate(event) { const source: string | undefined = event.cell?.datum?.source; void source; }, onViewportChange(event) { const first: string | undefined = event.viewport.y?.firstId; void first; } });
const viewport: HeatmapViewportValue = { x: { firstId: 'x', lastId: 'x' }, y: { firstId: 'y', lastId: 'y' } }; void viewport;
// @ts-expect-error categorical Y viewport cannot be a numeric pair
const numericY: HeatmapViewportValue = { y: [0, 1] }; void numericY;
// @ts-expect-error a Heatmap has row/column data, never Cartesian series
const series: HeatmapChartSpec = { ...spec, series: [] }; void series;
// @ts-expect-error categorical axes cannot become linear
const linear: HeatmapChartSpec = { ...spec, axes: { ...spec.axes, y: { kind: 'linear' } } }; void linear;
// @ts-expect-error cell identity has no fabricated series
const scoped: HeatmapChartSpec = { ...spec, selection: { mode: 'internal', initial: [{ seriesId: 'fake', pointId: 'observed' }] } }; void scoped;
// @ts-expect-error consumers cannot mutate original measurements
spec.data[0]!.value = 3;
// @ts-expect-error this family has no visibility-state proposals
createHeatmapChart(host, spec, { instanceId: 'bad-state', onStateChange() {} });
// @ts-expect-error mathematical color channels are numeric, never arbitrary CSS strings
const stop: ChartColorStop = { r: 'red', g: 0, b: 0 }; void stop;
