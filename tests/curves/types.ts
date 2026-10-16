import { createSplineChart } from '../../src/spline.js';
import { createAreaChart } from '../../src/area.js';
import type { SplineChartSpec, SplinePointActivation } from '../../src/spline.js';
import type { AreaChartSpec } from '../../src/area.js';
declare const host: HTMLElement;
const spline: SplineChartSpec<{ currency: string }> = {
  family: 'spline', title: 'Revenue', axes: { x: { kind: 'category', values: [{ id: 'a' }] }, y: { kind: 'linear' } },
  series: [{ id: 's', name: 'Series', data: [{ id: 'p', x: 'a', y: 2, datum: { currency: 'EUR' } }] }],
};
createSplineChart<{ currency: string }>(host, spline, { instanceId: 'spline', onPointActivate(event) { const currency: string | undefined = event.point.datum?.currency; void currency; } });
createSplineChart(host, { family: 'spline', title: 'Inferred', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 1, y: 2, datum: { currency: 'EUR' } }] }] }, { instanceId: 'inferred', onPointActivate(event) { const currency: string | undefined = event.point.datum?.currency; void currency; } });
const area: AreaChartSpec = { family: 'area', title: 'Area', axes: { x: { kind: 'linear' }, y: { kind: 'linear', includeZero: true } }, series: [{ id: 's', name: 'Series', curve: 'step-mid', data: [{ id: 'p', x: 1, y: -2 }] }] };
createAreaChart(host, area, { instanceId: 'area' });
// @ts-expect-error factories preserve their own family
createAreaChart(host, spline, { instanceId: 'wrong' });
// @ts-expect-error Spline interpolation has no arbitrary curve option
const arbitrary: SplineChartSpec = { ...spline, series: [{ id: 's', name: 'S', data: [], curve: 'step-mid' }] };
// @ts-expect-error Area's automatic baseline cannot exclude zero
const noZero: AreaChartSpec = { ...area, axes: { x: { kind: 'linear' }, y: { kind: 'linear', includeZero: false } } };
// @ts-expect-error categorical X cannot be numeric
const badX: SplineChartSpec = { family: 'spline', title: 'Bad', axes: { x: { kind: 'category', values: [] }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 3, y: 2 }] }] };
declare const activation: SplinePointActivation<{ currency: string }>;
if (activation.xKind === 'category') { const x: string = activation.point.x; void x; }
else { const x: number = activation.point.x; void x; }
// @ts-expect-error point records remain readonly
spline.series[0]!.data[0]!.y = 3;
type IsAny<T> = 0 extends (1 & T) ? true : false;
const noAny: IsAny<SplinePointActivation['point']['datum']> = false;
void arbitrary; void noZero; void badX; void noAny;
