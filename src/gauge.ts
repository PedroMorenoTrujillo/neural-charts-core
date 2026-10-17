import type { ChartResult } from './public/chart-types.js';
import type { GaugeChartSpec, GaugeMountOptions, GaugeController } from './public/gauge-types.js';
import { mountGauge } from './gauge/controller.js';
export type { GaugeBand, GaugeTarget, GaugeChartSpec, GaugeMountOptions, GaugeController, GaugeDescription, GaugeSnapshot, GaugeState } from './public/gauge-types.js';
export { describeGauge } from './gauge/describe.js';
export function createGaugeChart<T = unknown>(host: HTMLElement, spec: GaugeChartSpec<T>, options: GaugeMountOptions): ChartResult<GaugeController<T>> { return mountGauge(host, spec, options); }
