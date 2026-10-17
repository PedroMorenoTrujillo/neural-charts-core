import type { ShellFrame, Plot } from '../layout/frame.js';
import type { Layers } from '../axes/scene.js';
import type { Palette, ResolvedFont } from '../chart/presentation.js';
import type { TextMeasurer } from '../layout/text.js';
import type { QuantitativeColorScale } from './scale.js';
import { ellipsis } from '../layout/text.js';
import { NUMERIC_AXIS_CLASS } from '../chart/data-label-direction.js';
export type ColorKeySpec = Readonly<{ legend?: Readonly<{ position?: 'bottom' | 'end' | 'none' }>; direction?: 'ltr' | 'rtl' }>;

export type ColorKeyLayout = Readonly<{ width: number; height: number; offsetX: number; key: Plot | null; vertical: boolean }>;
export function colorKeyLayout(spec: ColorKeySpec, shell: ShellFrame, font: ResolvedFont, missing = false): ColorKeyLayout {
  const width = shell.body.width, height = shell.body.height;
  if (spec.legend?.position === 'none') return { width, height, offsetX: 0, key: null, vertical: false };
  if (spec.legend?.position === 'end' && width >= 640) {
    const cap = Math.max(108, font.size * 8), rtl = spec.direction === 'rtl';
    return { width: Math.max(0, width - cap), height, offsetX: rtl ? cap : 0, key: { x: rtl ? 0 : width - cap + 16, y: 12, width: cap - 20, height: Math.max(0, height - 24) }, vertical: true };
  }
  const cap = Math.max(48, font.size * 3 + 12) + (missing ? font.size + 10 : 0);
  return { width, height: Math.max(0, height - cap), offsetX: 0, key: { x: 12, y: Math.max(0, height - cap + 8), width: Math.max(0, width - 24), height: Math.min(cap - 12, height) }, vertical: false };
}
const compact = (value: number): string => {
  const significant = value.toPrecision(4), rounded = Number(significant);
  // Rounding MAX_VALUE can exceed the finite machine range. Keep the
  // presentation string rather than converting that rounded text to Infinity.
  return Number.isFinite(rounded) ? String(rounded) : significant;
};
/** The key uses precisely the same bounded OKLab evaluator as observed cells.
 * These are SVG rectangles, not an independently interpolated CSS gradient. */
export function colorKeyScene(layout: ColorKeyLayout, scale: QuantitativeColorScale, palette: Palette, font: ResolvedFont, layers: Layers, measurer: TextMeasurer, missing = false, direction: 'ltr' | 'rtl' = 'ltr'): void {
  const box = layout.key; if (!box || box.width < 24 || box.height < font.size * 2) return;
  const vertical = layout.vertical, length = vertical ? Math.max(0, box.height - font.size - (missing ? font.size + 22 : 0)) : box.width, thickness = 12, steps = scale.kind === 'threshold' ? scale.colors.length : 64;
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
  if (missing) {
    const y = vertical ? box.y + length + font.size + 6 : box.y + thickness + font.size + 12;
    if (y + 12 > box.y + box.height) return;
    layers.labels.push({ kind: 'rect', key: 'color-key-missing-box', x: box.x, y, width: 12, height: 12, presentation: { fill: { kind: 'solid', value: palette.surface }, stroke: { kind: 'solid', value: palette.axis }, strokeWidth: 1 } });
    layers.labels.push({ kind: 'path', key: 'color-key-missing-hatch', commands: [{ kind: 'M', x: box.x, y: y + 6 }, { kind: 'L', x: box.x + 6, y }, { kind: 'M', x: box.x, y: y + 12 }, { kind: 'L', x: box.x + 12, y }, { kind: 'M', x: box.x + 6, y: y + 12 }, { kind: 'L', x: box.x + 12, y: y + 6 }], presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.axis }, strokeWidth: 1 } });
    const text = ellipsis('Missing color value', box.width - 18, value => measurer.measure(value, font, 'ltr'));
    if (text) layers.labels.push({ kind: 'text', key: 'color-key-missing-label', text, x: box.x + 18, y: y + 10, anchor: direction === 'rtl' ? 'end' : 'start', baseline: 'alphabetic', fontFamily: font.family, fontSize: font.size, fontWeight: font.weight, presentation: { fill: { kind: 'solid', value: palette.muted } } });
  }
}
