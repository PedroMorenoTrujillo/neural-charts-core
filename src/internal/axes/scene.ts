import type { SceneCommand, SceneFrame, Layer, Presentation } from '../scene/model.js';
import type { AxesPlan, AxisInput, TickLabel } from './plan.js';
import type { Palette, Dash } from '../chart/presentation.js';
import { dashPattern } from '../chart/presentation.js';

export type Layers = Record<Layer, SceneCommand[]>;
export function emptyLayers(): Layers { return { background: [], grid: [], 'reference-bands': [], marks: [], 'reference-lines': [], axes: [], labels: [], interaction: [] }; }
export function frame(revision: number, width: number, height: number, layers: Layers, plan?: AxesPlan): SceneFrame {
  return { revision, width, height, defs: plan && !plan.tooSmall ? [{ key: 'plot', kind: 'clip-rect', ...plan.plot }] : [], layers };
}
// Cull redundant interior truncations only at presentation time. Tick positions,
// bounded layout boxes and full semantic values remain the accepted plan's.
export function displayLabels(labels: readonly TickLabel[]): ReadonlySet<TickLabel> {
  const visible = labels.filter(t => t.text), result = new Set<TickLabel>(), repeated = new Map<string, Set<string>>();
  for (const t of visible) if (t.text!.endsWith('…')) { const full = repeated.get(t.text!) ?? new Set<string>(); full.add(t.full); repeated.set(t.text!, full); }
  const seen = new Set<string>();
  for (const t of [visible[0], visible[visible.length - 1]]) if (t) { result.add(t); seen.add(t.text!); }
  for (const t of visible) if (!result.has(t) && (!seen.has(t.text!) || (repeated.get(t.text!)?.size ?? 0) <= 1)) { result.add(t); seen.add(t.text!); }
  return result;
}
export function axesScene(plan: AxesPlan, x: AxisInput, y: AxisInput, palette: Palette, layers: Layers, compact = false): void {
  if (plan.tooSmall) return;
  const plot = plan.plot, right = plot.x + plot.width, bottom = plot.y + plot.height, axis: Presentation = { stroke: { kind: 'solid', value: palette.axis }, strokeWidth: 1 };
  layers.axes.push({ kind: 'line', key: 'x-baseline', x1: plot.x, y1: bottom, x2: right, y2: bottom, presentation: axis }, { kind: 'line', key: 'y-baseline', x1: plot.x, y1: plot.y, x2: plot.x, y2: bottom, presentation: axis });
  const textStyle: Presentation = { fill: { kind: 'solid', value: palette.muted } }, font = { fontFamily: plan.font.family, fontSize: plan.font.size, fontWeight: plan.font.weight }, shown = displayLabels(plan.x.labels);
  for (const [horizontal, input, ticks] of [[true, x, plan.x.labels], [false, y, plan.y.labels]] as const) for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i]!, prefix = `${horizontal ? 'x' : 'y'}-tick-${i}`;
    layers.axes.push(horizontal ? { kind: 'line', key: prefix, x1: t.position, y1: bottom, x2: t.position, y2: bottom + 4, presentation: axis } : { kind: 'line', key: prefix, x1: plot.x - 4, y1: t.position, x2: plot.x, y2: t.position, presentation: axis });
    if ((input.grid ?? !horizontal) && (horizontal ? t.position !== plot.x : t.position !== bottom)) layers.grid.push(horizontal ? { kind: 'line', key: prefix + '-grid', x1: t.position, y1: plot.y, x2: t.position, y2: bottom, clipKey: 'plot', presentation: { stroke: { kind: 'solid', value: palette.grid }, strokeWidth: 1 } } : { kind: 'line', key: prefix + '-grid', x1: plot.x, y1: t.position, x2: right, y2: t.position, clipKey: 'plot', presentation: { stroke: { kind: 'solid', value: palette.grid }, strokeWidth: 1 } });
    if (t.text && (!horizontal || shown.has(t))) layers.labels.push({ kind: 'text', key: prefix + '-label', x: horizontal ? t.position : plot.x - 8, y: t.box.y + t.baseline, text: t.text, anchor: horizontal ? 'middle' : plan.direction === 'rtl' ? 'start' : 'end', baseline: 'alphabetic', presentation: textStyle, ...font });
  }
  if (plan.xTitle) layers.labels.push({ kind: 'text', key: 'x-title', x: plot.x + plot.width / 2, y: bottom + 8 + 1.25 * plan.font.size + (compact ? 6 : 10), text: plan.xTitle, anchor: 'middle', baseline: 'middle', presentation: textStyle, ...font, fontWeight: 500 });
  if (plan.yTitle) layers.labels.push({ kind: 'text', key: 'y-title', x: plot.x, y: compact ? 10 : 18, text: plan.yTitle, anchor: plan.direction === 'rtl' ? 'end' : 'start', baseline: 'middle', presentation: textStyle, ...font, fontWeight: 500 });
}
export type ReferenceInput = Readonly<{ id: string; axis: 'x' | 'y'; value: string | number; label?: string; color?: string; dash?: Dash }>;
export function referenceOutside(reference: ReferenceInput, domains: Readonly<{ x: readonly [number, number] | null; y: readonly [number, number] | null }>, categories: ReadonlyMap<string, number>): boolean {
  if (typeof reference.value === 'string') return !categories.has(reference.value);
  const domain = domains[reference.axis];
  return !!domain && (reference.value < Math.min(...domain) || reference.value > Math.max(...domain));
}
export function referenceScene(references: readonly ReferenceInput[], plan: AxesPlan, palette: Palette, layers: Layers, label: (text: string, width: number) => Readonly<{ text: string | null; width: number; height: number }>, categories: ReadonlyMap<string, number> = new Map()): readonly Readonly<{ id: string; outside: boolean }>[] {
  const boxes: Readonly<{ x: number; y: number; width: number; height: number }>[] = [], result: { id: string; outside: boolean }[] = [], plot = plan.plot;
  for (const r of references) {
    const p = r.axis === 'x' ? plan.mapX(r.value) : typeof r.value === 'number' ? plan.mapY(r.value) : null;
    const outside = referenceOutside(r, { x: plan.x.domain, y: plan.y.domain }, categories);
    result.push({ id: r.id, outside }); if (outside || p === null || plan.tooSmall) continue;
    const color = r.color ?? palette.reference, dash = r.dash ?? 'dashed', presentation: Presentation = { stroke: { kind: 'solid', value: color }, strokeWidth: 1.5, dash: dashPattern(dash), lineCap: dash === 'dotted' ? 'round' : 'butt' }, key = `r:${r.id.length}:${r.id}`;
    layers['reference-lines'].push(r.axis === 'x' ? { kind: 'line', key, x1: p, y1: plot.y, x2: p, y2: plot.y + plot.height, clipKey: 'plot', presentation } : { kind: 'line', key, x1: plot.x, y1: p, x2: plot.x + plot.width, y2: p, clipKey: 'plot', presentation });
    if (!r.label) continue;
    const m = label(r.label, Math.max(0, plot.width - 8)), bx = r.axis === 'x' ? Math.min(Math.max(p + 4, plot.x + 4), plot.x + plot.width - m.width - 4) : plot.x + 4, by = r.axis === 'x' ? plot.y + 4 : p - m.height - 4, box = { x: bx, y: by, width: m.width, height: m.height };
    if (!m.text || by < plot.y || by + m.height > plot.y + plot.height || boxes.some(b => bx - 4 < b.x + b.width && bx + m.width + 4 > b.x && by - 4 < b.y + b.height && by + m.height + 4 > b.y)) continue;
    boxes.push(box); layers.labels.push({ kind: 'text', key: key + '-label', x: plan.direction === 'rtl' ? bx + m.width : bx, y: by + m.height / 2, text: m.text, anchor: 'start', baseline: 'middle', clipKey: 'plot', fontFamily: plan.font.family, fontSize: plan.font.size, fontWeight: plan.font.weight, presentation: { fill: { kind: 'solid', value: color } } });
  }
  return result;
}
