import type { ChartResult } from '../public/chart-types.js';
import type { LineChartSpec, LineController } from '../public/line-types.js';
import type { LineProjection } from './geometry.js';
import type { Palette, Dash } from '../internal/chart/presentation.js';
import type { Layers } from '../internal/axes/scene.js';

/** Private extension seam: one cartesian lifecycle/interaction engine. */
export type LinePolicy<T> = Readonly<{
  parse(value: unknown): ChartResult<LineChartSpec<T>>;
  render(projection: LineProjection<T>, palette: Palette, layers: Layers, dashes: ReadonlyMap<string, Dash>): ChartResult<void>;
}>;
export type LineEngineController<T, S> = Omit<LineController<T>, 'update'> & {
  update(nextSpec: S): ChartResult<number>;
};
