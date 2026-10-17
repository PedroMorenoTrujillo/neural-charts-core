import type { ChartResult } from './public/chart-types.js';
import type { StackedAreaChartSpec, StackedAreaController, StackedAreaMountOptions } from './public/stacked-area-types.js';
import { mountStackedAreaChart } from './stacked-area/controller.js';
export function createStackedAreaChart<T = unknown>(host: HTMLElement, spec: StackedAreaChartSpec<T>, options: StackedAreaMountOptions<T>): ChartResult<StackedAreaController<T>> { return mountStackedAreaChart(host, spec, options); }
export { describeStackedArea } from './stacked-area/describe.js';
export type { StackedAreaChartSpec, StackedAreaController, StackedAreaMountOptions, StackedAreaPoint, StackedAreaSeries, StackedAreaPointActivation, StackedAreaSnapshot, StackedAreaDescription } from './public/stacked-area-types.js';
