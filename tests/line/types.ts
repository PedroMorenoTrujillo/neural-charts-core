import type {
  LineChartSpec, LinePointActivation, LineController, LineMountOptions,
  LineSeries, LineReference,
} from '../../src/public/line-types.js';
import type { ChartStatus, ChartStateBinding } from '../../src/index.js';

type Datum = Readonly<{ businessId: string }>;
const categories = [{ id: 'a', label: 'A' }, { id: 'b' }] as const;
const data = [{ id: 'p', x: 'a', y: 3, datum: { businessId: '42' } }] as const;
const series: readonly LineSeries<Datum, string>[] = [{ id: 's', name: 'Sales', data }];
const category: LineChartSpec<Datum> = {
  family: 'line', title: 'Sales', axes: { x: { kind: 'category', values: categories }, y: { kind: 'linear' } },
  series, references: [{ id: 'r', axis: 'x', value: 'a' }, { id: 'ry', axis: 'y', value: 1 }],
};
const linear: LineChartSpec = {
  family: 'line', title: 'Numeric', axes: { x: { kind: 'linear', domain: [0, 10] }, y: { kind: 'linear' } },
  series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 2.5, y: null }], dash: 'dotted', color: '#123abc' }],
  references: [{ id: 'r', axis: 'x', value: 2 }],
};
const time: LineChartSpec = { ...linear, axes: { x: { kind: 'time' }, y: { kind: 'linear' } } };
const internal: ChartStateBinding = { mode: 'internal' };
const controlled: ChartStateBinding = { mode: 'controlled', value: { hiddenSeriesIds: ['s'] } };
const statuses: readonly ChartStatus[] = [{ kind: 'ready' }, { kind: 'loading' }, { kind: 'empty', message: 'No observations' }, { kind: 'error', message: 'Unavailable' }];
const options: LineMountOptions<Datum> = {
  instanceId: 'chart', initialState: { hiddenSeriesIds: [] },
  onPointActivate(event) {
    const datum: Datum | undefined = event.point.datum;
    if (event.xKind === 'category') { const x: string = event.point.x; void x; }
    else { const x: number = event.point.x; void x; }
    void datum;
  },
};
type IsAny<T> = 0 extends (1 & T) ? true : false;
type AssertFalse<T extends false> = T;
type NoPointAny = AssertFalse<IsAny<LinePointActivation<Datum>['point']['datum']>>;
type NoUpdateAny = AssertFalse<IsAny<ReturnType<LineController<Datum>['update']>>>;

// @ts-expect-error Category data must use string X.
const badCategory: LineChartSpec = { family: 'line', title: 'T', axes: { x: { kind: 'category', values: [] }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 1, y: 1 }] }] };
// @ts-expect-error Numeric X cannot be a string.
const badLinear: LineChartSpec = { family: 'line', title: 'T', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: '1', y: 1 }] }] };
// @ts-expect-error Time X is an integer epoch number, never Date.
const badDate: LineChartSpec = { ...time, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: new Date(), y: 1 }] }] };
// @ts-expect-error Only the Line family exists.
const pie: LineChartSpec = { ...linear, family: 'pie' };
// @ts-expect-error Stacking is outside NC-01B.
const stacking: LineChartSpec = { ...linear, stacking: true };
// @ts-expect-error Range points are outside NC-01B.
const range: LineSeries = { id: 's', name: 'S', data: [{ id: 'p', x: 1, y: [0, 1] }] };
// @ts-expect-error Log axes are outside NC-01B.
const log: LineChartSpec = { ...linear, axes: { x: { kind: 'log' }, y: { kind: 'linear' } } };
// @ts-expect-error Multiple axes are outside NC-01B.
const multi: LineChartSpec = { ...linear, axes: { x: { kind: 'linear' }, y: [{ kind: 'linear' }] } };
// @ts-expect-error Arbitrary presentation fields are not public.
const arbitrary: LineSeries = { id: 's', name: 'S', data: [], opacity: 0.5 };
// @ts-expect-error Exact optional contracts reject explicit undefined.
const undefinedDescription: LineChartSpec = { ...linear, description: undefined };
// @ts-expect-error Marker shapes are not public.
const markerShape: LineSeries = { id: 's', name: 'S', data: [], markerShape: 'square' };
// @ts-expect-error HTML tooltips are not public.
const html: LineChartSpec = { ...linear, tooltip: { html: '<b>unsafe</b>' } };
// @ts-expect-error Category reference X must be a string.
const categoryReference: LineReference<string> = { id: 'r', axis: 'x', value: 1 };
// @ts-expect-error Controlled state requires a value.
const missingControlledState: ChartStateBinding = { mode: 'controlled' };
void [category, linear, time, internal, controlled, statuses, options];
export type TypeAssertions = [NoPointAny, NoUpdateAny];
