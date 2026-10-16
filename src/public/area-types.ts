import type { ChartResult } from './chart-types.js';
import type { LineChartSpec, LinePoint, LineSeries, LineController, LineMountOptions, LinePointActivation, LineSnapshot } from './line-types.js';
type AreaVariant<S> = S extends { readonly axes: Readonly<{ x: unknown; y: unknown }> }
  ? Omit<S, 'family' | 'axes'> & Readonly<{ family: 'area'; axes: Readonly<{ x: S['axes']['x']; y: Omit<S['axes']['y'], 'includeZero'> & Readonly<{ includeZero?: true }> }> }> : never;
export type AreaChartSpec<T = unknown> = AreaVariant<LineChartSpec<T>>;
export type AreaPoint<T = unknown, TX extends string | number = string | number> = LinePoint<T, TX>;
export type AreaSeries<T = unknown, TX extends string | number = string | number> = LineSeries<T, TX>;
export type AreaMountOptions<T = unknown> = LineMountOptions<T>;
export type AreaPointActivation<T = unknown> = LinePointActivation<T>;
export type AreaSnapshot = LineSnapshot;
export interface AreaController<T = unknown> extends Omit<LineController<T>, 'update'> {
  update(nextSpec: AreaChartSpec<T>): ChartResult<number>;
}
