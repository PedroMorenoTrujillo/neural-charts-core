import type { ChartResult } from './public/chart-types.js';
import type { DonutChartSpec, DonutController, RadialMountOptions, RadialDescription, RadialDescriptionOptions } from './public/radial-types.js';
import { mountRadialChart } from './radial/controller.js';
import { describeRadial } from './radial/describe.js';
export function createDonutChart<T = unknown>(host: HTMLElement, spec: DonutChartSpec<T>, options: RadialMountOptions<T>): ChartResult<DonutController<T>> { return mountRadialChart<T, DonutChartSpec<T>>(host, spec, options, 'donut'); }
export function describeDonut<T = unknown>(spec: DonutChartSpec<T>, options?: RadialDescriptionOptions): ChartResult<RadialDescription> { return describeRadial<T>(spec, 'donut', options); }
export type { PieSlice as DonutSlice, DonutChartSpec, DonutController, RadialState, RadialStateBinding, RadialStateChange, RadialMountOptions as DonutMountOptions, RadialPointActivation as DonutPointActivation, RadialSnapshot as DonutSnapshot, RadialDescription as DonutDescription, RadialDescriptionOptions as DonutDescriptionOptions } from './public/radial-types.js';
