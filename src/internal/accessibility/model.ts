import type { TooltipModel } from '../tooltip/model.js';
import { detailText } from '../tooltip/model.js';
export type SemanticPoint = Readonly<{ seriesName: string; row: number; column: number; text: string; detail: string }>;
export type SemanticModel = Readonly<{ rowCount: number; columnCount: number; current: SemanticPoint | null; summary: string }>;
export function semanticPoint(seriesName: string, row: number, column: number, x: string, y: number, context: string, tooltip: TooltipModel): SemanticPoint {
  return Object.freeze({ seriesName, row, column, text: `${seriesName}. X ${x}. Y ${String(y === 0 ? 0 : y)}.${context ? ' ' + context : ''}`, detail: detailText(tooltip, context) });
}
