import type { ResolvedFont } from '../chart/presentation.js';
import type { TextMeasurer } from './text.js';

export type Plot = Readonly<{ x: number; y: number; width: number; height: number }>;
export type ShellFrame = Readonly<{
  width: number; height: number; compact: boolean; header: Plot; textWidth: number; tableWidth: number;
  body: Plot; legend: Plot; legendPosition: 'bottom' | 'end' | 'none'; buttonWidths: readonly number[];
}>;
export function shellFrame(size: Readonly<{ width: number; height: number }>, hasDescription: boolean, names: readonly string[], position: 'bottom' | 'end' | 'none', font: ResolvedFont, direction: 'ltr' | 'rtl', measurer: TextMeasurer): ShellFrame {
  const width = Math.max(0, size.width), height = Math.max(0, size.height), inner = Math.max(0, width - 24), compact = inner < 640, padding = compact ? 8 : 12, gap = compact ? 4 : 8;
  const headerHeight = compact ? hasDescription ? 50 : 32 : Math.max(32, 20 + (hasDescription ? 22 : 0)), tableWidth = Math.min(compact ? 92 : 120, inner);
  const actualPosition = names.length === 0 || position === 'none' ? 'none' : position === 'end' && !compact ? 'end' : 'bottom';
  const buttonWidths = names.map(name => Math.min(160, inner, measurer.measure(name, { ...font, size: 12, weight: 400 }, direction).width + 40));
  let rows = 0, used = 0;
  for (const w of buttonWidths) { if (rows === 0) rows = 1; if (used > 0 && used + 8 + w > inner) { rows++; used = w; } else used += (used ? 8 : 0) + w; }
  const legendHeight = actualPosition === 'bottom' ? Math.min(72, rows * 32) : 0;
  const bodyTop = padding + headerHeight + (compact ? 4 : 6), bodyHeight = Math.max(0, height - bodyTop - padding - (actualPosition === 'bottom' ? legendHeight + gap : 0)), bodyWidth = Math.max(0, inner - (actualPosition === 'end' ? 168 : 0));
  const rtlEnd = actualPosition === 'end' && direction === 'rtl';
  return Object.freeze({ width, height, compact, header: { x: 12, y: padding, width: inner, height: Math.min(headerHeight, Math.max(0, height - 2 * padding)) }, textWidth: Math.max(0, inner - tableWidth - 8), tableWidth, body: { x: rtlEnd ? 180 : 12, y: bodyTop, width: bodyWidth, height: bodyHeight }, legend: actualPosition === 'end' ? { x: rtlEnd ? 12 : 12 + bodyWidth + 8, y: bodyTop, width: 160, height: bodyHeight } : { x: 12, y: bodyTop + bodyHeight + gap, width: inner, height: legendHeight }, legendPosition: actualPosition, buttonWidths: Object.freeze(buttonWidths) });
}
