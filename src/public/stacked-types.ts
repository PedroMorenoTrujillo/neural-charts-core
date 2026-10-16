import type { ChartResult } from './chart-types.js';
import type { ColumnChartSpec, ColumnController, ColumnMountOptions, ColumnPointActivation, ColumnSnapshot, ColumnPoint, ColumnSeries } from './column-types.js';
export type StackedChartSpec<T = unknown> = Omit<ColumnChartSpec<T>, 'family' | 'barGap'> & Readonly<{ family: 'stacked'; stacking: 'sum' | 'percent'; barGap?: never }>;
export type StackedPoint<T = unknown> = ColumnPoint<T>;
export type StackedSeries<T = unknown> = ColumnSeries<T>;
export type StackedMountOptions<T = unknown> = ColumnMountOptions<T>;
export type StackedPointActivation<T = unknown> = ColumnPointActivation<T>;
export type StackedSnapshot = ColumnSnapshot;
export interface StackedController<T = unknown> extends Omit<ColumnController<T>, 'update'> { update(spec: StackedChartSpec<T>): ChartResult<number>; }
