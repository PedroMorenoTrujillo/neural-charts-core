import type { ChartResult } from '../../public/chart-types.js';
import type { Plot as Rect } from './frame.js';
import type { TextMetrics } from './text.js';
import { ok, invalid } from '../diagnostics.js';
export type LabelPosition = Readonly<{ x: number; y: number; color: string; background?: string }>;
export type DataLabelCandidate = Readonly<{ key: string; text: string; positions(metrics: TextMetrics): readonly LabelPosition[] }>;
export type DataLabelPlacement = LabelPosition & Readonly<{ key: string; text: string; width: number; height: number; baseline: number }>;
export function pointLabelPositions(x: number, y: number, plot: Rect, m: TextMetrics, color: string, gap = 8, background?: string): readonly LabelPosition[] {
  const above = y - m.height - gap, side = above >= plot.y ? above : y + gap, style = { color, ...(background === undefined ? {} : { background }) };
  return [{ x: x - m.width / 2, y: above, ...style }, { x: x - m.width / 2, y: y + gap, ...style }, { x: x + gap, y: side, ...style }, { x: x - m.width - gap, y: side, ...style }];
}
export function labelIndices(length: number): readonly number[] {
  const count = Math.min(200, length);
  if (!Number.isSafeInteger(length) || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => count === 1 ? 0 : Math.floor(i * (length - 1) / (count - 1)));
}
export function labelBoxesOverlap(a: Rect, b: Rect, padding = 0): boolean {
  return a.x < b.x + b.width + padding && a.x + a.width + padding > b.x && a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;
}
export function layoutDataLabels(candidates: readonly DataLabelCandidate[], plot: Rect, measure: (text: string) => TextMetrics, obstructed: (box: Rect, key: string) => boolean): ChartResult<readonly DataLabelPlacement[]> {
  if (candidates.length > 200 || ![plot.x, plot.y, plot.width, plot.height].every(Number.isFinite) || plot.width < 0 || plot.height < 0) return invalid('INVALID_CONFIG', 'BAD_LABEL_LAYOUT', 'labels');
  const result: DataLabelPlacement[] = [], metrics = new Map<string, TextMetrics>();
  for (const candidate of candidates) {
    let m = metrics.get(candidate.text); if (!m) { m = measure(candidate.text); metrics.set(candidate.text, m); }
    if (![m.width, m.height, m.baseline].every(Number.isFinite) || m.width < 0 || m.height < 0) return invalid('INVALID_NUMBER', 'BAD_TEXT_MEASUREMENT', 'labels');
    if (!m.width || !m.height || m.width > plot.width || m.height > plot.height) continue;
    for (const position of candidate.positions(m).slice(0, 4)) {
      const box = { x: position.x, y: position.y, width: m.width, height: m.height };
      if (![box.x, box.y, box.x + box.width, box.y + box.height].every(Number.isFinite)) return invalid('INVALID_NUMBER', 'BAD_LABEL_LAYOUT', 'labels');
      if (box.x < plot.x || box.y < plot.y || box.x + box.width > plot.x + plot.width || box.y + box.height > plot.y + plot.height || result.some(other => labelBoxesOverlap(box, other, 3)) || obstructed(box, candidate.key)) continue;
      result.push(Object.freeze({ ...position, key: candidate.key, text: candidate.text, width: m.width, height: m.height, baseline: m.baseline })); break;
    }
  }
  return ok(Object.freeze(result));
}
