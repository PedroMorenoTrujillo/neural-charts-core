import type { ChartResult } from './public/chart-types.js';
import type { GaugeChartSpec, GaugeMountOptions, GaugeController, GaugeDescription } from './public/gauge-types.js';
import { mountGauge } from './gauge/controller.js';
import { describeGauge as describe } from './gauge/describe.js';
export type { GaugeBand, GaugeTarget, GaugeChartSpec, GaugeMountOptions, GaugeController, GaugeDescription, GaugeSnapshot, GaugeState } from './public/gauge-types.js';
export function describeGauge(input: unknown): ChartResult<GaugeDescription> { return describe(input); }
export function createGaugeChart<T = unknown>(host: HTMLElement, spec: GaugeChartSpec<T>, options: GaugeMountOptions): ChartResult<GaugeController<T>> { return mountGauge(host, spec, options); }
