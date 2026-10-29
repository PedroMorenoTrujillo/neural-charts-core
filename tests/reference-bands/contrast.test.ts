import { expect, it } from 'vitest';
import { heatmapPolicy } from '../../src/heatmap/strategy.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { shellFrame } from '../../src/internal/layout/frame.js';
const font = { family: 'sans-serif', size: 12, weight: 400 } as const;
const measurer = { measure(text: string) { return { width: text.length * 6, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} };
function luminance(value: string): number { const rgb = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!; }
it('keeps actual Heatmap reference labels at 4.5:1 above quantitative cells in both default themes', () => {
  for (const theme of ['light', 'dark'] as const) {
    const policy = heatmapPolicy(), parsed = policy.parse({ family: 'heatmap', title: 'Reference contrast', theme, axes: { x: { kind: 'category', values: ['a', 'b', 'c'].map(id => ({ id })) }, y: { kind: 'category', values: ['r0', 'r1'].map(id => ({ id })) } }, data: ['r0', 'r1'].flatMap((rowId, r) => ['a', 'b', 'c'].map((columnId, c) => ({ id: rowId + columnId, rowId, columnId, value: r * 3 + c }))), references: [{ id: 'row', axis: 'y', value: 'r1', label: 'Row center' }] }); if (parsed.status === 'invalid') throw Error(JSON.stringify(parsed));
    const palette = defaultPalette(theme, false), shell = shellFrame({ width: 768, height: 400 }, false, [], 'bottom', font, 'ltr', measurer), result = policy.compute(parsed.value, policy.state([]), shell, palette, font, measurer); if (result.status === 'invalid') throw Error(JSON.stringify(result));
    const layers = result.value.layers, label = layers.labels.find(node => node.kind === 'text' && node.key === 'r:3:row-label'); if (label?.kind !== 'text' || label.presentation?.fill?.kind !== 'solid') throw Error('Missing actual label');
    const probeX = label.x + measurer.measure(label.text).width / 2;
    const rect = [...layers.marks, ...layers.labels.slice(0, layers.labels.indexOf(label))].reverse().find(node => node.kind === 'rect' && node.presentation?.fill?.kind === 'solid' && probeX >= node.x && probeX <= node.x + node.width && label.y >= node.y && label.y <= node.y + node.height);
    if (rect?.kind !== 'rect' || rect.presentation?.fill?.kind !== 'solid') throw Error('Missing actual background');
    const ink = label.presentation.fill.value, background = rect.presentation.fill.value, a = luminance(ink), b = luminance(background), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    expect(ratio, JSON.stringify({ theme, ink, background, ratio })).toBeGreaterThanOrEqual(4.5);
  }
});
