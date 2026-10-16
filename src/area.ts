import { mountAreaChart } from './area/controller.js';
import type { ChartResult } from './public/chart-types.js';
import type { AreaChartSpec, AreaController, AreaMountOptions } from './public/area-types.js';
export function createAreaChart<T = unknown>(host: HTMLElement, spec: AreaChartSpec<T>, options: AreaMountOptions<T>): ChartResult<AreaController<T>> {
  return mountAreaChart<T>(host, spec, options);
}
export type { AreaPoint, AreaSeries, AreaChartSpec, AreaController, AreaMountOptions, AreaPointActivation, AreaSnapshot } from './public/area-types.js';
