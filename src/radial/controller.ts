import type { ChartResult } from '../public/chart-types.js';
import type { RadialChartSpec, RadialController, RadialMountOptions } from '../public/radial-types.js';
import { mountFamily } from '../internal/chart/family-controller.js';
import { radialPolicy } from './strategy.js';
/** Both radial facades use the private family lifecycle, not another chart. */
export function mountRadialChart<T, S extends RadialChartSpec<T>>(host: HTMLElement, spec: S, options: RadialMountOptions<T>, family: 'pie' | 'donut'): ChartResult<RadialController<S>> {
  return mountFamily(host, spec, options, radialPolicy<T>(family));
}
