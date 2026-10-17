import type { ShellFrame, Plot } from '../internal/layout/frame.js';
import type { AxesPlan } from '../internal/axes/plan.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import type { TextMeasurer } from '../internal/layout/text.js';
import type { QuantitativeColorScale } from '../internal/color/scale.js';
import { ellipsis } from '../internal/layout/text.js';
import { NUMERIC_AXIS_CLASS } from '../internal/chart/data-label-direction.js';
import type { HeatmapChartSpec } from '../public/heatmap-types.js';

export type HeatmapLegendLayout = Readonly<{ width: number; height: number; offsetX: number; key: Plot | null; vertical: boolean }>;
export function heatmapLegendLayout(spec: HeatmapChartSpec, shell: ShellFrame, font: ResolvedFont): HeatmapLegendLayout {
  const width = shell.body.width, height = shell.body.height;
  if (spec.legend?.position === 'none') return { width, height, offsetX: 0, key: null, vertical: false };
  if (spec.legend?.position === 'end' && width >= 640) {
    const cap = Math.max(108, font.size * 8), rtl = spec.direction === 'rtl';
    return { width: Math.max(0, width - cap), height, offsetX: rtl ? cap : 0, key: { x: rtl ? 0 : width - cap + 16, y: 12, width: cap - 20, height: Math.max(0, height - 24) }, vertical: true };
  }
  const cap = Math.max(48, font.size * 3 + 12);
  return { width, height: Math.max(0, height - cap), offsetX: 0, key: { x: 12, y: Math.max(0, height - cap + 8), width: Math.max(0, width - 24), height: Math.min(cap - 12, height) }, vertical: false };
}
export function offsetHeatmapAxes(plan: AxesPlan, x: number): AxesPlan {
  if (!x) return plan;
  return Object.freeze({ ...plan, plot: { ...plan.plot, x: plan.plot.x + x },
    x: { ...plan.x, labels: plan.x.labels.map(label => ({ ...label, position: label.position + x, box: { ...label.box, x: label.box.x + x } })) },
    y: { ...plan.y, labels: plan.y.labels.map(label => ({ ...label, box: { ...label.box, x: label.box.x + x } })) },
    mapX(value: string | number) { const mapped = plan.mapX(value); return mapped === null ? null : mapped + x; },
  });
}
const compact = (value: number): string => {
  const significant = value.toPrecision(4), rounded = Number(significant);
  // Rounding MAX_VALUE can exceed the finite machine range. Keep the
  // presentation string rather than converting that rounded text to Infinity.
  return Number.isFinite(rounded) ? String(rounded) : significant;
};
/** The key uses precisely the same bounded OKLab evaluator as observed cells.
 * These are SVG rectangles, not an independently interpolated CSS gradient. */
export function heatmapLegendScene(layout: HeatmapLegendLayout, scale: QuantitativeColorScale, palette: Palette, font: ResolvedFont, layers: Layers, measurer: TextMeasurer): void {
  const box = layout.key; if (!box || box.width < 24 || box.height < font.size * 2) return;
  const vertical = layout.vertical, length = vertical ? box.height - font.size : box.width, thickness = 12, steps = scale.kind === 'threshold' ? scale.colors.length : 64;
  const bar = { x: box.x, y: box.y, width: vertical ? thickness : length, height: vertical ? length : thickness };
  for (let i = 0; i < steps; i++) {
    const start = i * length / steps, end = (i + 1) * length / steps;
    // A half-unit overlap seals shared antialiased edges without changing
    // sample colors, class boundaries or the outer key dimensions.
    const sealedEnd = Math.min(length, end + .5);
    layers.labels.push({ kind: 'rect', key: 'color-key:' + i, x: bar.x + (vertical ? 0 : start), y: bar.y + (vertical ? length - sealedEnd : 0), width: vertical ? thickness : sealedEnd - start, height: vertical ? sealedEnd - start : thickness, presentation: { fill: { kind: 'solid', value: scale.colorAtFraction(scale.kind === 'threshold' ? (i + .5) / steps : i / (steps - 1)) } } });
  }
  const texts: Readonly<{ text: string; fraction: number }>[] = scale.kind === 'threshold'
    ? scale.colors.map((_, i) => ({ text: i === 0 ? '<' + compact(scale.boundaries[0]!) : i === steps - 1 ? '≥' + compact(scale.boundaries[i - 1]!) : compact(scale.boundaries[i - 1]!) + '–<' + compact(scale.boundaries[i]!), fraction: (i + .5) / steps }))
    : scale.domain ? scale.constant ? [{ text: compact(scale.domain[0]!), fraction: .5 }] : scale.domain.map(value => ({ text: compact(value), fraction: scale.fraction(value) })) : [];
  for (let i = 0; i < texts.length; i++) {
    const item = texts[i]!, cap = vertical ? box.width - thickness - 6 : box.width / Math.max(2, texts.length), text = ellipsis(item.text, cap, value => measurer.measure(value, font, 'ltr'));
    if (!text) continue;
    layers.labels.push({ kind: 'text', key: 'color-key-label:' + i, classes: [NUMERIC_AXIS_CLASS], text,
      x: vertical ? box.x + thickness + 6 : box.x + item.fraction * length,
      y: vertical ? box.y + length * (1 - item.fraction) + font.size / 3 : box.y + thickness + font.size + 4,
      anchor: vertical ? 'start' : item.fraction === 0 ? 'start' : item.fraction === 1 ? 'end' : 'middle',
      baseline: 'alphabetic', fontFamily: font.family, fontSize: font.size, fontWeight: font.weight,
      presentation: { fill: { kind: 'solid', value: palette.muted } },
    });
  }
}
