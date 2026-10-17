import type { ChartResult } from '../public/chart-types.js';
import type { StackedAreaChartSpec, StackedAreaController, StackedAreaMountOptions } from '../public/stacked-area-types.js';
import { mountFamily } from '../internal/chart/family-controller.js';
import { stackedAreaPolicy } from './strategy.js';
export function mountStackedAreaChart<T>(host: HTMLElement, spec: StackedAreaChartSpec<T>, options: StackedAreaMountOptions<T>): ChartResult<StackedAreaController<T>> { return mountFamily(host, spec, options, stackedAreaPolicy<T>()); }
