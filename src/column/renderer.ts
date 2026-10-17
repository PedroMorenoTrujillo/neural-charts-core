import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { ColumnChartSpec, ColumnController } from '../public/column-types.js';
import type { ChartCategoryWindow } from '../public/viewport-types.js';
import type { NormalizedColumn } from './normalize.js';
import type { ColumnProjection, ColumnRect } from './geometry.js';
import type { Domain } from '../internal/math/domain.js';
import type { Plot } from '../internal/layout/frame.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette } from '../internal/chart/presentation.js';
import type { TooltipModel } from '../internal/tooltip/model.js';

/** Private geometry policy over the existing rectangle lifecycle/interaction. */
export type ColumnPolicy<T> = Readonly<{
  parse(value: unknown): ChartResult<ColumnChartSpec<T>>;
  domain(data: NormalizedColumn<T>, state: ChartState): ChartResult<Domain | null>;
  project(data: NormalizedColumn<T>, state: ChartState, plot: Plot, domain: Domain, window?: ChartCategoryWindow): ChartResult<ColumnProjection<T>>;
  render(projection: ColumnProjection<T>, palette: Palette, layers: Layers): void;
  pick(projection: ColumnProjection<T>, x: number, y: number): ColumnRect<T> | null;
  context(data: NormalizedColumn<T>): string;
  emptyStatus(projection: ColumnProjection<T>): string | null;
  tooltip(target: ColumnRect<T>, model: TooltipModel, projection: ColumnProjection<T>): TooltipModel;
  dataLabel?(target: ColumnRect<T>, projection: ColumnProjection<T>): string | null;
}>;
export type ColumnEngineController<T, S> = Omit<ColumnController<T>, 'update'> & { update(spec: S): ChartResult<number> };
