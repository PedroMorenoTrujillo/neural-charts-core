import type { ChartDataTable, ChartResult } from './chart-types.js';
import type { LineChartSpec, LinePoint, LineSeries, LineController, LineMountOptions, LinePointActivation, LineSnapshot } from './line-types.js';
type Variant<S> = S extends Readonly<{ axes: Readonly<{ x: unknown; y: unknown }>; series: readonly unknown[] }>
  ? Omit<S, 'family' | 'series' | 'axes'> & Readonly<{
    family: 'stacked-area'; stacking: 'sum' | 'percent';
    axes: Readonly<{ x: S['axes']['x']; y: Omit<S['axes']['y'], 'includeZero'> & Readonly<{ includeZero?: true }> }>;
    series: readonly (Omit<S['series'][number], 'curve' | 'gaps'> & Readonly<{ curve?: never; gaps?: 'break' }>)[];
  }> : never;
export type StackedAreaChartSpec<T = unknown> = Variant<LineChartSpec<T>>;
export type StackedAreaPoint<T = unknown, TX extends string | number = string | number> = LinePoint<T, TX>;
export type StackedAreaSeries<T = unknown, TX extends string | number = string | number> = Omit<LineSeries<T, TX>, 'curve' | 'gaps'> & Readonly<{ curve?: never; gaps?: 'break' }>;
export type StackedAreaMountOptions<T = unknown> = LineMountOptions<T>;
export type StackedAreaPointActivation<T = unknown> = LinePointActivation<T>;
export type StackedAreaSnapshot = LineSnapshot;
export interface StackedAreaController<T = unknown> extends Omit<LineController<T>, 'update'> { update(spec: StackedAreaChartSpec<T>): ChartResult<number>; }
export type StackedAreaDescription = Readonly<{ title: string; description: string; direction: 'ltr' | 'rtl'; view: 'ready' | 'loading' | 'empty' | 'error' | 'no-visible-series'; status: string; context: string; table: ChartDataTable }>;
