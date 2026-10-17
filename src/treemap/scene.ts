import type { ChartResult } from '../public/chart-types.js';
import type { ClipDef } from '../internal/scene/model.js';
import type { PathCommand } from '../internal/geometry/path.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import type { TextMeasurer } from '../internal/layout/text.js';
import { ellipsis } from '../internal/layout/text.js';
import { labelIndices, layoutDataLabels } from '../internal/layout/data-labels.js';
import { insideLabelInk } from '../internal/layout/contrast.js';
import { ok } from '../internal/diagnostics.js';
import type { TreeProjection } from './geometry.js';
import type { TreeColors } from './color.js';
/** Parent backgrounds are drawn before descendants. Each retained label owns
 * a bounded clip; hidden labels never remove raw hierarchy/table data. */
export function treeScene<T>(projection: TreeProjection<T>, colors: TreeColors<T>, palette: Palette, font: ResolvedFont, layers: Layers, labels: boolean, direction: 'ltr' | 'rtl', measurer: TextMeasurer): ChartResult<readonly ClipDef[]> {
  for (const target of projection.targets) {
    const rect = target.paint; if (!rect || !rect.width || !rect.height) continue;
    const branch = target.record.node.children !== undefined;
    layers.marks.push({ kind: 'rect', key: 'tree-node:' + target.record.node.id, ...rect, clipKey: 'plot', presentation: { fill: { kind: 'solid', value: colors.color(target.record) }, ...(branch ? { fillOpacity: colors.quantitative ? 1 : .12 } : {}), stroke: { kind: 'solid', value: palette.surface }, strokeWidth: 1 } });
    if (colors.missing(target.record)) {
      const commands: PathCommand[] = [], spacing = Math.max(8, (rect.width + rect.height) / 24);
      for (let offset = -rect.height; offset <= rect.width; offset += spacing) {
        const start = Math.max(0, -offset), end = Math.min(rect.height, rect.width - offset); if (end <= start) continue;
        commands.push({ kind: 'M', x: rect.x + offset + start, y: rect.y + rect.height - start }, { kind: 'L', x: rect.x + offset + end, y: rect.y + rect.height - end });
      }
      layers.marks.push({ kind: 'path', key: 'tree-color-missing:' + target.record.node.id, commands, clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.axis }, strokeWidth: 1 } });
    }
  }
  if (!labels) return ok([]);
  const eligible = projection.targets.filter(target => target.record.node.children !== undefined ? target.header !== null : target.paint !== null), boxes = new Map<string, NonNullable<typeof eligible[number]['paint']>>();
  const candidates = labelIndices(eligible.length).flatMap(index => {
    const target = eligible[index]!, box = target.header ?? target.paint!, branch = target.record.node.children !== undefined;
    if (box.width < 12 || box.height < font.size + 4) return [];
    const key = target.record.node.id, text = ellipsis(target.record.node.label ?? key, box.width - 8, value => measurer.measure(value, font, direction)); if (!text) return [];
    boxes.set(key, box); const color = branch ? palette.text : insideLabelInk(colors.color(target.record), palette.surface) ?? palette.text;
    return [{ key, text, positions: (m: Readonly<{ width: number; height: number }>) => m.height + 4 <= box.height ? [{ x: box.x + (box.width - m.width) / 2, y: box.y + (box.height - m.height) / 2, color }] : [] }];
  });
  const placed = layoutDataLabels(candidates, projection.plot, text => measurer.measure(text, font, direction), () => false); if (placed.status === 'invalid') return placed;
  const clips: ClipDef[] = [];
  for (let index = 0; index < placed.value.length; index++) {
    const item = placed.value[index]!, clipKey = 'tree-label:' + index; clips.push({ key: clipKey, kind: 'clip-rect', ...boxes.get(item.key)! });
    layers.labels.push({ kind: 'text', key: 'tree-label:' + item.key, classes: ['nc-owned-hierarchy-label'], clipKey, text: item.text, x: item.x + item.width / 2, y: item.y + item.baseline, anchor: 'middle', baseline: 'alphabetic', fontFamily: font.family, fontSize: font.size, fontWeight: font.weight, presentation: { fill: { kind: 'solid', value: item.color } } });
  }
  return ok(clips);
}
