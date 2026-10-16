import type { ChartResult } from '../public/chart-types.js';
import type { SplineChartSpec, SplineController, SplineMountOptions } from '../public/spline-types.js';
import { createLineChart } from '../line/controller.js';
import { validateVariant } from '../line/variant.js';
import { splineScene } from './scene.js';
export function mountSplineChart<T>(host: HTMLElement, spec: SplineChartSpec<T>, options: SplineMountOptions<T>): ChartResult<SplineController<T>> {
  return createLineChart<T, SplineChartSpec<T>>(host, spec, options, { parse: value => validateVariant<T>(value, 'spline'), render: splineScene });
}
