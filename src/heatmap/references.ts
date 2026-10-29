import type { HeatmapAxis, HeatmapReference } from '../public/heatmap-types.js';
import type { AxesPlan, AxisInput } from '../internal/axes/plan.js';
import type { Layers, ReferenceInput } from '../internal/axes/scene.js';
import type { Palette } from '../internal/chart/presentation.js';
import type { TextMeasurer } from '../internal/layout/text.js';
import { record, array, text, color, choice, optional, fail } from '../internal/data/validation.js';
import { referenceScene } from '../internal/axes/scene.js';
import { ellipsis } from '../internal/layout/text.js';
import { referenceLabelScene } from '../internal/axes/reference-band-view.js';
type Axes = Readonly<{ x: HeatmapAxis; y: HeatmapAxis }>;
export function parseHeatmapReferences(input: unknown, axes: Axes): readonly HeatmapReference[] {
  const seen = new Set<string>(), ids = { x: new Set(axes.x.values.map(value => value.id)), y: new Set(axes.y.values.map(value => value.id)) };
  return Object.freeze(array(input, 16, 'references').map((value, i) => {
    const at = 'references[' + i + ']', item = record(value, ['id', 'axis', 'value', 'label', 'color', 'dash'], ['id', 'axis', 'value'], at);
    const id = text(item.id, at + '.id', 64), axis = choice(item.axis, ['x', 'y'], at + '.axis'), target = text(item.value, at + '.value', 128);
    if (seen.has(id)) fail(at + '.id', 'DUPLICATE_ID'); seen.add(id);
    if (!ids[axis].has(target)) fail(at + '.value', 'UNKNOWN_CATEGORY', 'UNKNOWN_CATEGORY');
    optional(item, 'label', text, at); optional(item, 'color', color, at); optional(item, 'dash', (value, path) => choice(value, ['solid', 'dashed', 'dotted'], path), at);
    return Object.freeze({ ...item, id, axis, value: target }) as HeatmapReference;
  }));
}
export function heatmapReferenceContext(references: readonly HeatmapReference[] | undefined, axes: Axes): string {
  if (!references?.length) return '';
  return 'References: ' + references.map(reference => {
    const label = axes[reference.axis].values.find(value => value.id === reference.value)?.label;
    return (reference.label ?? reference.id) + '. ' + reference.axis.toUpperCase() + ' ' + (label && label !== reference.value ? label + ' (' + reference.value + ')' : reference.value);
  }).join('; ') + '. References outside the displayed viewport are not drawn.';
}
export function heatmapReferencesScene(references: readonly HeatmapReference[] | undefined, plan: AxesPlan, scoped: Readonly<{ x: AxisInput; y: AxisInput }>, palette: Palette, layers: Layers, measurer: TextMeasurer): void {
  if (!references?.length || plan.tooSmall) return;
  const x = new Map((scoped.x.values ?? []).map((value, i) => [value.id, i])), y = new Map((scoped.y.values ?? []).map((value, i) => [value.id, i]));
  const projected = references.flatMap<ReferenceInput>(reference => reference.axis === 'x' ? x.has(reference.value) ? [reference] : [] : y.has(reference.value) ? [{ ...reference, value: y.get(reference.value)! }] : []);
  const firstLabel = layers.labels.length;
  referenceScene(projected, plan, palette, layers, (text, width) => { const fitted = ellipsis(text, width, text => measurer.measure(text, plan.font, plan.direction)), metrics = measurer.measure(fitted ?? '', plan.font, plan.direction); return { text: fitted, width: metrics.width, height: metrics.height }; }, x);
  for (const node of layers.labels.splice(firstLabel)) if (node.kind === 'text') referenceLabelScene(node, plan, palette, layers, measurer);
}
