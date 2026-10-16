import { mountSplineChart } from './spline/controller.js';
import type { ChartResult } from './public/chart-types.js';
import type { SplineChartSpec, SplineController, SplineMountOptions } from './public/spline-types.js';
export function createSplineChart<T = unknown>(host: HTMLElement, spec: SplineChartSpec<T>, options: SplineMountOptions<T>): ChartResult<SplineController<T>> {
  return mountSplineChart<T>(host, spec, options);
}
export type { SplinePoint, SplineSeries, SplineChartSpec, SplineController, SplineMountOptions, SplinePointActivation, SplineSnapshot } from './public/spline-types.js';
