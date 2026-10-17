import { createGaugeChart, describeGauge } from '../../src/gauge.js';
import type { GaugeChartSpec, GaugeController, GaugeBand } from '../../src/gauge.js';
import { exportSvg, exportCsv, exportPng } from '../../src/export.js';
const band: GaugeBand = { id: 'operating', from: 20, to: 70, color: '#26715b', label: 'Operating interval' };
const spec: GaugeChartSpec<Readonly<{ id: string }>> = { family: 'gauge', title: 'Pressure', value: null, domain: [0, 100], datum: { id: 'sensor' }, unit: 'kPa', preset: 'arc', bands: [band], target: { value: 75 } };
declare const host: HTMLElement;
const result = createGaugeChart(host, spec, { instanceId: 'pressure', onDiagnostic: diagnostic => { const path: string = diagnostic.path; void path; } });
if (result.status === 'ok') { const controller: GaugeController<Readonly<{ id: string }>> = result.value; controller.update({ ...spec, value: 155 }); exportSvg(controller); exportCsv(controller); void exportPng(controller); controller.destroy(); }
describeGauge(spec);
// @ts-expect-error A scalar has no selection/viewport/visibility ownership.
const selectable: GaugeChartSpec = { ...spec, selection: { mode: 'internal' } };
// @ts-expect-error A Gauge scalar is not a Cartesian series.
const series: GaugeChartSpec = { ...spec, series: [] };
// @ts-expect-error Needle is deferred, not an empty option.
const needle: GaugeChartSpec = { ...spec, needle: true };
// @ts-expect-error A valid domain always has exactly two numeric endpoints.
const short: GaugeChartSpec = { ...spec, domain: [0] };
// @ts-expect-error Read-only scalar inputs cannot be changed by point activation.
createGaugeChart(host, spec, { instanceId: 'bad', onPointActivate: () => {} });
declare const controller: GaugeController;
// @ts-expect-error No fake selection method is exposed.
controller.requestSelection([]);
// @ts-expect-error No fake viewport method is exposed.
controller.requestViewport({});
void [selectable, series, needle, short];
