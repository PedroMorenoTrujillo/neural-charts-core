import type { DataLabelPlacement } from '../layout/data-labels.js';
import type { Layers } from '../axes/scene.js';
import type { ResolvedFont } from './presentation.js';
import { NUMERIC_LABEL_CLASS } from './data-label-direction.js';
export function dataLabelScene(placements: readonly DataLabelPlacement[], font: ResolvedFont, layers: Layers): void {
  for (const item of placements) {
    if (item.background) layers.labels.push({ kind: 'rect', key: 'data-label-backdrop:' + item.key, classes: ['nc-owned-data-label-background'], clipKey: 'plot', x: item.x - 2, y: item.y - 1, width: item.width + 4, height: item.height + 2, presentation: { fill: { kind: 'solid', value: item.background } } });
    layers.labels.push({ kind: 'text', key: 'data-label:' + item.key, classes: [NUMERIC_LABEL_CLASS], clipKey: 'plot', x: item.x + item.width / 2, y: item.y + item.baseline, text: item.text, anchor: 'middle', baseline: 'alphabetic', fontFamily: font.family, fontSize: font.size, fontWeight: font.weight, presentation: { fill: { kind: 'solid', value: item.color } } });
  }
}
