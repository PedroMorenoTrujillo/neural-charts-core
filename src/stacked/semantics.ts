import type { ColumnProjection, ColumnRect } from '../column/geometry.js';
import type { TooltipModel } from '../internal/tooltip/model.js';
import type { NormalizedColumn } from '../column/normalize.js';
import type { StackedProjection } from './geometry.js';
import { stackMode } from './validate.js';

export function stackContext<T>(data: NormalizedColumn<T>): string {
  return stackMode(data.spec) === 'percent'
    ? 'Percent of visible total. Zero totals and incomplete categories have no percentage geometry. Table values are original; hidden series are excluded from the denominator.'
    : 'Positive and negative stacks accumulate separately. Missing segments leave incomplete totals. Table values are original; visible totals exclude hidden series.';
}
export function stackEmptyStatus<T>(projection: ColumnProjection<T>): string | null {
  const stack = (projection as StackedProjection<T>).stack;
  return stack.mode === 'percent' && !stack.drawableCount ? 'Percentages are undefined for zero totals or incomplete categories. View the data table for the original observations.' : null;
}
export function stackedDataLabel<T>(target: ColumnRect<T>, projection: ColumnProjection<T>): string | null {
  const stack = (projection as StackedProjection<T>).stack;
  if (stack.mode !== 'percent') return String(target.point.y === 0 ? 0 : target.point.y);
  const segment = stack.categories.get(target.point.x)?.segments.find(segment => segment.seriesId === target.series.spec.id && segment.point.id === target.point.id);
  return segment?.percentage === null || segment?.percentage === undefined ? null : Number(segment.percentage.toPrecision(6)) + '%';
}
export function stackedTooltip<T>(target: ColumnRect<T>, model: TooltipModel, projection: ColumnProjection<T>): TooltipModel {
  const stack = (projection as StackedProjection<T>).stack, category = stack.categories.get(target.point.x)!;
  let context: string;
  if (stack.mode === 'percent') {
    const segment = category.segments.find(segment => segment.seriesId === target.series.spec.id && segment.point.id === target.point.id)!;
    context = Number(segment.percentage!.toPrecision(6)) + '% of visible total. ' + (category.total === null ? 'Raw total exceeds finite numeric range; proportions use normalized ratios.' : 'Raw total: ' + category.total + '.');
  } else context = 'Positive total: ' + category.positive + '. Negative total: ' + category.negative + '. Net total: ' + category.total + '.' + (category.complete ? '' : ' Incomplete total: missing observations in visible series.');
  return Object.freeze({ ...model, context });
}
