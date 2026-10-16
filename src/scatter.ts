import type { ChartResult } from './public/chart-types.js';
import type { ScatterChartSpec, ScatterMountOptions, ScatterController, ScatterDescription, ScatterDescriptionOptions } from './public/scatter-types.js';
import { mountFamily } from './internal/chart/family-controller.js';
import { scatterPolicy } from './scatter/strategy.js';
import { describeScatter as describe } from './scatter/describe.js';
export function createScatterChart<T = unknown>(host: HTMLElement, spec: ScatterChartSpec<T>, options: ScatterMountOptions<T>): ChartResult<ScatterController<T>> { return mountFamily(host, spec, options, scatterPolicy<T>()); }
export function describeScatter<T = unknown>(spec: ScatterChartSpec<T>, options?: ScatterDescriptionOptions): ChartResult<ScatterDescription> { return describe<T>(spec, options); }
export type { ScatterChartSpec, ScatterPoint, ScatterSeries, ScatterMarkerShape, NumericAxis, ScatterReferenceLine, ScatterController, ScatterMountOptions, ScatterPointActivation, ScatterSnapshot, ScatterDescription, ScatterDescriptionOptions } from './public/scatter-types.js';
