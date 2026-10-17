import type { TreemapData } from './validate.js';
import type { TreeColors } from './color.js';
import type { ShellFrame, Plot } from '../internal/layout/frame.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import type { TextMeasurer } from '../internal/layout/text.js';
import type { Layers } from '../internal/axes/scene.js';
import { ellipsis } from '../internal/layout/text.js';
import { colorKeyLayout, colorKeyScene, type ColorKeyLayout } from '../internal/color/key.js';
export type TreeKey = Readonly<{ plot: Plot; quantitative: ColorKeyLayout | null; categorical: Plot | null; vertical: boolean; missing: boolean }>;
export function treeKeyLayout<T>(data: TreemapData<T>, shell: ShellFrame, font: ResolvedFont, quantitative: boolean): TreeKey {
  const { width, height } = shell.body, missing = data.hierarchy.nodes.some(record => record.node.children === undefined && record.colorValue === null);
  if (data.spec.legend?.position === 'none') return { plot: { x: 0, y: 0, width, height }, quantitative: null, categorical: null, vertical: false, missing };
  if (quantitative) { const key = colorKeyLayout(data.spec, shell, font, missing); return { plot: { x: key.offsetX, y: 0, width: key.width, height: key.height }, quantitative: key, categorical: null, vertical: key.vertical, missing }; }
  const end = data.spec.legend?.position === 'end' && width >= 640, cap = end ? Math.min(180, width / 3) : Math.min(height, font.size * 3 + 20), rtl = data.spec.direction === 'rtl';
  return { plot: end ? { x: rtl ? cap : 0, y: 0, width: Math.max(0, width - cap), height } : { x: 0, y: 0, width, height: Math.max(0, height - cap) }, quantitative: null, categorical: end ? { x: rtl ? 0 : width - cap + 12, y: 8, width: cap - 16, height: Math.max(0, height - 16) } : { x: 8, y: Math.max(0, height - cap + 8), width: Math.max(0, width - 16), height: Math.max(0, cap - 8) }, vertical: end, missing };
}
export function treeKeyScene<T>(data: TreemapData<T>, layout: TreeKey, colors: TreeColors<T>, palette: Palette, font: ResolvedFont, layers: Layers, measurer: TextMeasurer): void {
  if (colors.quantitative && layout.quantitative) { colorKeyScene(layout.quantitative, colors.quantitative, palette, font, layers, measurer, layout.missing, data.spec.direction ?? 'ltr'); return; }
  const box = layout.categorical; if (!box || box.width < 30 || box.height < font.size + 4) return;
  const root = data.hierarchy.nodes[0]!, groups = root.children.length ? root.sorted.map(index => data.hierarchy.nodes[index]!) : [root];
  let x = box.x, y = box.y, shown = 0;
  for (const group of groups.slice(0, 100)) {
    const available = Math.min(180, box.width), label = ellipsis(group.node.label ?? group.node.id, available - 22, text => measurer.measure(text, font, data.spec.direction ?? 'ltr'));
    if (!label) break;
    const width = measurer.measure(label, font, data.spec.direction ?? 'ltr').width + 24;
    if (!layout.vertical && x > box.x && x + width > box.x + box.width) { x = box.x; y += font.size + 10; }
    if (y + font.size + 10 > box.y + box.height) break;
    layers.labels.push({ kind: 'rect', key: 'tree-group-key:' + group.node.id, x, y: y + 2, width: 10, height: 10, presentation: { fill: { kind: 'solid', value: colors.color(group) } } });
    layers.labels.push({ kind: 'text', key: 'tree-group-caption:' + group.node.id, text: label, x: x + 16, y: y + font.size, anchor: data.spec.direction === 'rtl' ? 'end' : 'start', baseline: 'alphabetic', fontFamily: font.family, fontSize: font.size, fontWeight: font.weight, presentation: { fill: { kind: 'solid', value: palette.muted } } });
    shown++; if (layout.vertical) y += font.size + 10; else x += width;
  }
  // No visibility owner is invented: omitted key captions remain available in
  // the complete hierarchical table and the node's accessible detail.
  if (shown < groups.length && y + font.size * 2 + 12 <= box.y + box.height) layers.labels.push({ kind: 'text', key: 'tree-key-more', text: '+' + (groups.length - shown) + ' groups in data table', x: box.x, y: y + font.size * 2 + 8, anchor: data.spec.direction === 'rtl' ? 'end' : 'start', fontFamily: font.family, fontSize: font.size, presentation: { fill: { kind: 'solid', value: palette.muted } } });
}
