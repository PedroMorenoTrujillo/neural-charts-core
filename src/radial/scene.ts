import type { ChartResult } from '../public/chart-types.js';
import type { RadialChartSpec, RadialDescription, PieSlice } from '../public/radial-types.js';
import type { RadialSlice } from './math.js';
import type { RadialProjection } from './geometry.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import { assignment } from '../internal/chart/presentation.js';
import { ellipsis, type TextMetrics } from '../internal/layout/text.js';
import { ok, invalid } from '../internal/diagnostics.js';
import { polar, TAU } from './math.js';
import { radialLabelFits, radialLeaderClear, radialFocusAnchor } from './geometry.js';
import { layoutRadialLabels, type RadialLabelCandidate } from './labels.js';
import { sliceShareText } from './describe.js';
import { insideLabelInk } from './contrast.js';
type Measure = (text: string, font: ResolvedFont) => TextMetrics;
function paint<T>(point: PieSlice<T>, palette: Palette): string { return point.color ?? palette.series[assignment(point.id).colorIndex]!; }
const key = (kind: string, id: string) => 'radial-' + kind + '/' + id.length + '/' + id;
export function radialScene<T>(projection: RadialProjection<T>, spec: RadialChartSpec<T>, description: RadialDescription, palette: Palette, font: ResolvedFont, measure: Measure, layers: Layers): ChartResult<void> {
  if (projection.tooSmall || description.view !== 'ready') return ok(undefined);
  const separation = projection.marks.length <= 80;
  for (const mark of projection.marks) layers.marks.push({ kind: 'path', key: key('slice', mark.slice.point.id), commands: mark.commands, presentation: { fill: { kind: 'solid', value: paint(mark.slice.point, palette) }, ...(separation ? { stroke: { kind: 'solid' as const, value: palette.surface }, strokeWidth: 1 } : {}) } });
  const fontProps = { fontFamily: font.family, fontSize: font.size, fontWeight: font.weight }, ordered = [...projection.marks].sort((a, b) => b.slice.fraction - a.slice.fraction || (a.slice.point.id < b.slice.point.id ? -1 : a.slice.point.id > b.slice.point.id ? 1 : 0)).slice(0, 200);
  const metricsOf = (text: string) => measure(text, font), widthOf = (text: string) => metricsOf(text).width;
  if (spec.labels !== 'off') {
    if (projection.outsideLabels) {
      const candidates: RadialLabelCandidate[] = [], columnWidth = Math.min(132, projection.bounds.width * .22), lineHeight = font.size * 1.3;
      for (const mark of ordered) {
        const slice = mark.slice, angle = slice.start + (slice.end - slice.start) / 2, anchor = polar(projection.frame, projection.frame.radius, angle), elbow = polar(projection.frame, projection.frame.radius + 8, angle), side = anchor.x >= projection.frame.cx ? 'right' : 'left';
        const full = slice.point.label + ' · ' + sliceShareText(slice.point.value, slice.fraction, true), fullMetrics = metricsOf(full);
        if (!Number.isFinite(fullMetrics.width) || fullMetrics.width < 0) return invalid('INVALID_NUMBER', 'BAD_TEXT_MEASUREMENT', 'radial.labels');
        const text = ellipsis(full, columnWidth, text => text === full ? fullMetrics : metricsOf(text)); if (!text) continue;
        const width = widthOf(text); if (!Number.isFinite(width) || width < 0) return invalid('INVALID_NUMBER', 'BAD_TEXT_MEASUREMENT', 'radial.labels');
        candidates.push({ id: slice.point.id, text, side, idealY: anchor.y, x: side === 'left' ? projection.bounds.x + 12 : projection.bounds.x + projection.bounds.width - 12 - width, width, height: lineHeight, priority: slice.fraction, anchor, elbow });
      }
      const labels = layoutRadialLabels(candidates, projection.bounds); if (labels.status === 'invalid') return labels;
      for (const label of labels.value) {
        if (!radialLeaderClear(projection.frame, label.leader)) continue;
        layers.labels.push({ kind: 'path', key: key('leader', label.id), commands: [{ kind: 'M', ...label.leader[0] }, { kind: 'L', ...label.leader[1] }, { kind: 'L', ...label.leader[2] }], presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.muted }, strokeWidth: 1 } });
        layers.labels.push({ kind: 'text', key: key('label', label.id), x: label.box.x + label.box.width / 2, y: label.box.y + label.box.height / 2, text: label.text, anchor: 'middle', baseline: 'middle', ...fontProps, presentation: { fill: { kind: 'solid', value: palette.text } } });
      }
    } else if (spec.labels === 'inside') {
      for (const mark of ordered) {
        const text = mark.slice.point.label + ' · ' + sliceShareText(mark.slice.point.value, mark.slice.fraction, true), width = widthOf(text), height = font.size * 1.3;
        if (!Number.isFinite(width) || width < 0) return invalid('INVALID_NUMBER', 'BAD_TEXT_MEASUREMENT', 'radial.labels');
        const ink = insideLabelInk(paint(mark.slice.point, palette), palette.surface);
        if (!ink || !radialLabelFits(projection.frame, mark.slice, { x: mark.anchor.x - width / 2, y: mark.anchor.y - height / 2, width, height })) continue;
        layers.labels.push({ kind: 'text', key: key('label', mark.slice.point.id), x: mark.anchor.x, y: mark.anchor.y, text, anchor: 'middle', baseline: 'middle', ...fontProps, presentation: { fill: { kind: 'solid', value: ink } } });
      }
    }
  }
  if (spec.family === 'donut' && spec.center !== false && projection.frame.innerRadius >= 24) {
    const center = spec.center, radius = projection.frame.innerRadius, width = radius * 1.35, value = center?.value ?? (description.total === null ? 'Unavailable' : String(description.total)), label = center?.label ?? (center?.value === undefined ? description.totalIncomplete ? 'Known total' : 'Visible total' : '');
    const bold: ResolvedFont = { ...font, weight: 600 }, boldMetrics = (text: string) => measure(text, bold);
    const valueText = ellipsis(value, width, boldMetrics), labelText = ellipsis(label, width, metricsOf), cy = projection.frame.cy, cx = projection.frame.cx;
    const fits = (text: string, y: number, textFont: ResolvedFont) => { const width = measure(text, textFont).width, height = textFont.size * 1.3; return radialLabelFits({ ...projection.frame, radius, innerRadius: 0 }, { start: 0, end: TAU }, { x: cx - width / 2, y: y - height / 2, width, height }, 4); };
    const twoLines = !!valueText && !!labelText && fits(valueText, cy - font.size * .55, bold) && fits(labelText, cy + font.size * .95, font);
    const valueY = twoLines ? cy - font.size * .55 : cy;
    if (valueText && fits(valueText, valueY, bold)) layers.labels.push({ kind: 'text', key: 'radial-center-value', x: cx, y: valueY, text: valueText, anchor: 'middle', baseline: 'middle', ...fontProps, fontWeight: 600, presentation: { fill: { kind: 'solid', value: palette.text } } });
    if (labelText && (twoLines || !valueText && fits(labelText, cy, font))) layers.labels.push({ kind: 'text', key: 'radial-center-label', x: cx, y: twoLines ? cy + font.size * .95 : cy, text: labelText, anchor: 'middle', baseline: 'middle', ...fontProps, presentation: { fill: { kind: 'solid', value: palette.muted } } });
  }
  return ok(undefined);
}
export function radialFocusScene<T>(projection: RadialProjection<T>, target: RadialSlice<PieSlice<T>>, palette: Palette, layers: Layers): void {
  const mark = projection.markById.get(target.point.id);
  if (mark) layers.interaction.push({ kind: 'path', key: 'radial-focus', commands: mark.commands, presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.focus }, strokeWidth: 3 } });
  else { const anchor = radialFocusAnchor(projection, target); layers.interaction.push({ kind: 'circle', key: 'radial-zero-focus', cx: anchor.x, cy: anchor.y, r: 4, presentation: { fill: { kind: 'solid', value: palette.surface }, stroke: { kind: 'solid', value: palette.focus }, strokeWidth: 2 } }); }
}
