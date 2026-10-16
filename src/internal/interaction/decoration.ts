import type { ChartCrosshair } from '../../public/interaction-types.js';
import type { Layers } from '../axes/scene.js';
import { emptyLayers } from '../axes/scene.js';
import type { Palette } from '../chart/presentation.js';
import type { Plot } from '../layout/frame.js';
/** Persistent selection is an outlined, dashed cue, separate from focus. The
 * family supplies exact geometry; presentation keys never contain datum IDs. */
export function selectionScene<Id>(layers: Layers, ids: readonly Id[], draw: (id: Id, target: Layers) => void): void {
  ids.forEach((id, index) => {
    const selected = emptyLayers(); draw(id, selected);
    for (const command of selected.interaction) layers.interaction.push({ ...command, key: 'selected-' + index + '-' + command.key, presentation: { ...command.presentation, fill: { kind: 'none' }, dash: [3, 2] } });
  });
}
/** Crosshair axes are logical; horizontal Bar maps category X to physical Y.
 * The frozen Scene writer validates coordinates and applies the real clip. */
export function crosshairScene(layers: Layers, mode: ChartCrosshair | undefined, plot: Plot, point: Readonly<{ x: number; y: number }>, palette: Palette, horizontalValues = false): void {
  if (!mode) return;
  for (const axis of ['x', 'y'] as const) if (mode === axis || mode === 'xy') {
    const vertical = axis === 'x' ? !horizontalValues : horizontalValues;
    layers.interaction.push({ kind: 'line', key: 'crosshair-' + axis, x1: vertical ? point.x : plot.x, y1: vertical ? plot.y : point.y, x2: vertical ? point.x : plot.x + plot.width, y2: vertical ? plot.y + plot.height : point.y, clipKey: 'plot', presentation: { stroke: { kind: 'solid', value: palette.reference }, strokeWidth: 1, dash: [3, 3] } });
  }
}
