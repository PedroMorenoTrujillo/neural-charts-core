import { createMixedChart, describeMixed, type MixedChartSpec, type MixedSeries, type MixedPointActivation } from '../../src/mixed.js';
declare const host: HTMLElement;
const spec: MixedChartSpec<{ key: string }> = { family: 'mixed', title: 'Composition', axes: { x: { kind: 'category', values: [{ id: 'jan-a', label: 'Jan' }, { id: 'jan-b', label: 'Jan' }] }, y: { kind: 'linear' } }, series: [{ kind: 'column', id: 'volume', name: 'Volume', data: [{ id: 'a', x: 'jan-a', y: 3, datum: { key: 'raw' } }] }, { kind: 'line', id: 'target', name: 'Target', curve: 'step-after', data: [{ id: 'a', x: 'jan-a', y: 4 }] }], viewport: { mode: 'controlled', axes: 'xy', value: { x: { firstId: 'jan-a', lastId: 'jan-b' }, y: [0, 5] } }, selection: { mode: 'controlled', kind: 'single', value: [] } };
const result = createMixedChart(host, spec, { instanceId: 'typed', onPointActivate(event) { const kind: 'line' | 'area' | 'column' = event.kind; const key: string | undefined = event.point.datum?.key; void [kind, key]; } });
describeMixed(spec);
if (result.status === 'ok') { result.value.update(spec); result.value.requestSelection([{ seriesId: 'volume', pointId: 'a' }]); result.value.requestViewport({ x: { firstId: 'jan-a', lastId: 'jan-b' }, y: [1, 5] }); }
// @ts-expect-error Column has no Line-only curves.
const wrongColumn: MixedSeries = { kind: 'column', id: 's', name: 'S', curve: 'step-before', data: [] };
// @ts-expect-error Scatter numeric X is not a category observation.
const numeric: MixedSeries = { kind: 'line', id: 's', name: 'S', data: [{ id: 'p', x: 2, y: 3 }] };
// @ts-expect-error Mixed does not promise horizontal layout.
const horizontal: MixedChartSpec = { ...spec, orientation: 'horizontal' };
// @ts-expect-error A second value axis is outside this contract.
const dual: MixedChartSpec = { ...spec, axes: { ...spec.axes, y2: { kind: 'linear' } } };
// @ts-expect-error Mixed stacking is a distinct unsupported semantic.
const stacked: MixedChartSpec = { ...spec, stacking: 'sum' };
// @ts-expect-error Viewport category windows are identities, not numeric pairs.
const viewport: MixedChartSpec = { ...spec, viewport: { mode: 'internal', axes: 'x', initial: { x: [1, 2] } } };
declare const raw: MixedPointActivation;
// @ts-expect-error Opaque payload defaults to unknown.
const payload: string = raw.point.datum.key;
void [wrongColumn, numeric, horizontal, dual, stacked, viewport, payload];
