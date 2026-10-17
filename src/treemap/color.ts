import type { Palette } from '../internal/chart/presentation.js';
import { assignment } from '../internal/chart/presentation.js';
import { defaultColorRamp } from '../internal/color/defaults.js';
import { createColorScale, type QuantitativeColorScale } from '../internal/color/scale.js';
import type { ChartResult } from '../public/chart-types.js';
import { ok } from '../internal/diagnostics.js';
import type { TreemapData } from './validate.js';
import type { TreeRecord } from './hierarchy.js';
export type TreeColors<T> = Readonly<{ quantitative: QuantitativeColorScale | null; color(record: TreeRecord<T>): string; missing(record: TreeRecord<T>): boolean }>;
export function treeColors<T>(data: TreemapData<T>, palette: Palette): ChartResult<TreeColors<T>> {
  const value = data.spec.color?.by === 'value', parsed = value ? createColorScale(data.colorScale ?? defaultColorRamp(palette), data.hierarchy.colorExtent) : null;
  if (parsed?.status === 'invalid') return parsed;
  const scale = parsed?.value ?? null;
  return ok({ quantitative: scale, color: record => scale ? record.node.children !== undefined || record.colorValue === null ? palette.surface : scale.color(record.colorValue) : palette.series[assignment(record.groupId).colorIndex]!, missing: record => !!scale && record.node.children === undefined && record.colorValue === null });
}
