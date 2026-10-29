import type { AxisInput, AxesPlan } from './plan.js';
import type { Layers } from './scene.js';
import type { ReferenceBand, ReferenceAxisContract } from './reference-bands.js';
import type { TextMeasurer } from '../layout/text.js';
import type { Palette } from '../chart/presentation.js';
import { insideLabelInk } from '../layout/contrast.js';
import { validateReferenceBands, projectReferenceBands, referenceBandsScene } from './reference-bands.js';
import { referenceBandAxes } from './reference-band-axes.js';
import { ok } from '../diagnostics.js';
type Axes = Readonly<{ x: AxisInput; y: AxisInput }>;
/** Called only when the additive field is present. No scale or data domain is
 * created, and original category identity is retained across viewport changes. */
export function parseReferenceBands(input: unknown, axes: Axes) {
  const contract = (axis: AxisInput): ReferenceAxisContract => axis.kind === 'category'
    ? { kind: 'category', ranks: new Map((axis.values ?? []).map((value, i) => [value.id, i])) }
    : { kind: axis.kind };
  return validateReferenceBands(input, { x: contract(axes.x), y: contract(axes.y) });
}
export function referenceBandContext(bands: readonly ReferenceBand[] | undefined, axes: Axes): string {
  if (!bands?.length) return '';
  const endpoint = (axis: AxisInput, value: string | number): string => {
    if (axis.kind !== 'category') return String(value) + (axis.kind === 'time' ? ' UTC epoch ms' : '');
    const category = axis.values?.find(item => item.id === value);
    return category?.label && category.label !== value ? category.label + ' (' + value + ')' : String(value);
  };
  return 'Reference ranges: ' + bands.map(band => (band.label ?? band.id) + '. ' + band.axis.toUpperCase() + ' from ' + endpoint(axes[band.axis], band.from) + ' to ' + endpoint(axes[band.axis], band.to) + (axes[band.axis].kind === 'category' ? ', inclusive' : '')).join('; ') + '. Ranges are clipped to the displayed domain; these are the original endpoints.';
}
type ReferenceLabel = Extract<Layers['labels'][number], { kind: 'text' }>;
/** New decoration labels need a known background above opaque data marks.
 * Keep that small backplate clipped and use the existing contrast primitive. */
export function referenceLabelScene(node: ReferenceLabel, plan: AxesPlan, palette: Palette, layers: Layers, measurer: TextMeasurer): void {
  const m = measurer.measure(node.text, plan.font, plan.direction), anchor = node.anchor ?? 'start';
  const x = node.x - (anchor === 'middle' ? m.width / 2 : (anchor === 'end') !== (plan.direction === 'rtl') ? m.width : 0);
  layers.labels.push({ kind: 'rect', key: node.key + '-backplate', x: x - 2, y: node.y - m.height / 2 - 2, width: m.width + 4, height: m.height + 4, clipKey: 'plot', presentation: { fill: { kind: 'solid', value: palette.surface } } });
  layers.labels.push({ ...node, presentation: { ...node.presentation, fill: { kind: 'solid', value: insideLabelInk(palette.surface, palette.surface) ?? palette.text } } });
}
export function drawReferenceBands(bands: readonly ReferenceBand[] | undefined, plan: AxesPlan, scoped: Axes, original: Axes, palette: Palette, layers: Layers, measurer: TextMeasurer, horizontal = false, outline = false) {
  if (!bands?.length || plan.tooSmall) return ok(undefined);
  const projected = projectReferenceBands(bands, plan.plot, referenceBandAxes(plan, scoped, original, horizontal));
  if (projected.status === 'invalid') return projected;
  if (outline) for (const { band, box } of projected.value) {
    // Heatmap color is data. Outlines remain visible above opaque cells without
    // tinting their original color-scale encoding.
    layers['reference-lines'].push({ kind: 'rect', key: 'band-outline:' + band.id.length + ':' + band.id, ...box, clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: band.color ?? palette.reference }, strokeWidth: 1.5, opacity: band.opacity ?? 1 } });
  } else referenceBandsScene(projected.value, palette.reference, layers);
  const measure = (text: string) => measurer.measure(text, plan.font, plan.direction);
  // Existing reference-line labels keep priority. A label is omitted visually
  // when its complete text cannot fit; accessible prose always retains it.
  const occupied = layers.labels.flatMap(node => {
    if (node.kind !== 'text') return [];
    const m = measure(node.text), anchor = node.anchor ?? 'start';
    return [{ x: node.x - (anchor === 'middle' ? m.width / 2 : (anchor === 'end') !== (plan.direction === 'rtl') ? m.width : 0), y: node.y - m.height / 2, width: m.width, height: m.height }];
  });
  for (const { band, box } of projected.value) {
    if (!band.label || band.opacity === 0) continue;
    const m = measure(band.label), label = { x: box.x + 4, y: box.y + 4, width: m.width, height: m.height };
    if (m.width > box.width - 8 || m.height > box.height - 8 || occupied.some(other => label.x - 4 < other.x + other.width && label.x + label.width + 4 > other.x && label.y - 4 < other.y + other.height && label.y + label.height + 4 > other.y)) continue;
    occupied.push(label);
    referenceLabelScene({ kind: 'text', key: 'band-label:' + band.id.length + ':' + band.id, x: plan.direction === 'rtl' ? label.x + label.width : label.x, y: label.y + label.height / 2, text: band.label, anchor: 'start', baseline: 'middle', clipKey: 'plot', fontFamily: plan.font.family, fontSize: plan.font.size, fontWeight: plan.font.weight }, plan, palette, layers, measurer);
  }
  return ok(undefined);
}
