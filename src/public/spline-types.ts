import type { ChartResult } from './chart-types.js';
import type { LineChartSpec, LinePoint, LineSeries, LineController, LineMountOptions, LinePointActivation, LineSnapshot } from './line-types.js';
type SplineVariant<S> = S extends { readonly series: readonly unknown[] }
  ? Omit<S, 'family' | 'series'> & Readonly<{ family: 'spline'; series: readonly (Omit<S['series'][number], 'curve'> & Readonly<{ curve?: never }>)[] }> : never;
export type SplineChartSpec<T = unknown> = SplineVariant<LineChartSpec<T>>;
export type SplinePoint<T = unknown, TX extends string | number = string | number> = LinePoint<T, TX>;
export type SplineSeries<T = unknown, TX extends string | number = string | number> = Omit<LineSeries<T, TX>, 'curve'> & Readonly<{ curve?: never }>;
export type SplineMountOptions<T = unknown> = LineMountOptions<T>;
export type SplinePointActivation<T = unknown> = LinePointActivation<T>;
export type SplineSnapshot = LineSnapshot;
export interface SplineController<T = unknown> extends Omit<LineController<T>, 'update'> {
  update(nextSpec: SplineChartSpec<T>): ChartResult<number>;
}
