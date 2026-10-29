import type { ChartResult } from './public/chart-types.js';
import type { MixedChartSpec, MixedMountOptions, MixedController } from './public/mixed-types.js';
import { mountFamily } from './internal/chart/family-controller.js';
import { mixedPolicy } from './mixed/strategy.js';
export function createMixedChart<T = unknown>(host: HTMLElement, spec: MixedChartSpec<T>, options: MixedMountOptions<T>): ChartResult<MixedController<T>> { return mountFamily(host, spec, options, mixedPolicy<T>()); }
export { describeMixed } from './mixed/describe.js';
export type { MixedChartSpec, MixedSeries, MixedPoint, MixedMountOptions, MixedPointActivation, MixedController, MixedSnapshot, MixedDescription } from './public/mixed-types.js';
