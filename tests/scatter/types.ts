import { createScatterChart, describeScatter } from '../../src/scatter.js';
import type { ScatterChartSpec, ScatterPointActivation } from '../../src/scatter.js';
const spec: ScatterChartSpec<{ source: string }> = { family: 'scatter', title: 'XY', axes: { x: { kind: 'linear', reversed: true }, y: { kind: 'linear' } }, series: [{ id: 'set', name: 'Set', data: [{ id: 'one', x: 2, y: 3, datum: { source: 'sample' } }] }] };
declare const host: HTMLElement;
const chart = createScatterChart(host, spec, { instanceId: 'typed-scatter', onPointActivate(event) { const payload: string | undefined = event.point.datum?.source; void payload; }, onStateChange(event) { const hidden: readonly string[] = event.state.hiddenSeriesIds; void hidden; } });
if (chart.status === 'ok') { chart.value.update(spec); chart.value.getState(); chart.value.destroy(); }
describeScatter(spec, { initialState: { hiddenSeriesIds: [] } });
// @ts-expect-error True Scatter accepts numeric X only.
const category: ScatterChartSpec = { ...spec, series: [{ id: 's', name: 'S', data: [{ id: 'a', x: 'January', y: 2 }] }] };
// @ts-expect-error Datum is strongly typed.
const wrongPayload: ScatterChartSpec<{ source: string }> = { ...spec, series: [{ id: 's', name: 'S', data: [{ id: 'a', x: 1, y: 2, datum: { source: 3 } }] }] };
// @ts-expect-error XY is not a category axis.
const wrongAxis: ScatterChartSpec = { ...spec, axes: { x: { kind: 'category', values: [] }, y: { kind: 'linear' } } };
// @ts-expect-error Radial state has no place in Scatter.
describeScatter(spec, { initialState: { hiddenSliceIds: [] } });
declare const event: ScatterPointActivation<{ source: string }>;
// @ts-expect-error Activation is a domain event, not a browser MouseEvent.
const mouse: MouseEvent = event;
// @ts-expect-error Consumer data are readonly.
spec.series[0]!.data.push({ id: 'bad', x: 1, y: 1 });
void [category, wrongPayload, wrongAxis, mouse];
