import type { ChartResult } from './public/chart-types.js';
import type { StackedChartSpec, StackedController, StackedMountOptions } from './public/stacked-types.js';
import { mountStackedChart } from './stacked/controller.js';
export function createStackedChart<T = unknown>(host: HTMLElement, spec: StackedChartSpec<T>, options: StackedMountOptions<T>): ChartResult<StackedController<T>> { return mountStackedChart(host, spec, options); }
export type { StackedChartSpec, StackedController, StackedMountOptions, StackedPoint, StackedSeries, StackedPointActivation, StackedSnapshot } from './public/stacked-types.js';
