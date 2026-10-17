import type { SceneCommand } from '../scene/model.js';
import type { TextMetrics } from './text.js';
import type { LabelObstacle } from './label-obstacles.js';
/** Only the Cartesian primitives emitted by the existing owned renderers.
 * Filled areas are not obstacles; their separately stroked contours are. */
export function labelPaint(commands: readonly SceneCommand[], measure: (text: string) => TextMetrics, rtl: boolean): readonly LabelObstacle[] {
  const obstacles: LabelObstacle[] = [];
  const segment = (key: string, x: number, y: number, endX: number, endY: number): void => { obstacles.push({ key, box: { x: Math.min(x, endX), y: Math.min(y, endY), width: Math.abs(endX - x), height: Math.abs(endY - y) }, segment: [x, y, endX, endY] }); };
  for (const item of commands) {
    const tx = item.translate?.x ?? 0, ty = item.translate?.y ?? 0;
    if (item.kind === 'circle') obstacles.push({ key: item.key, box: { x: item.cx + tx - item.r, y: item.cy + ty - item.r, width: item.r * 2, height: item.r * 2 } });
    else if (item.kind === 'rect') obstacles.push({ key: item.key, box: { x: item.x + tx, y: item.y + ty, width: item.width, height: item.height } });
    else if (item.kind === 'line') segment(item.key, item.x1 + tx, item.y1 + ty, item.x2 + tx, item.y2 + ty);
    else if (item.kind === 'text') {
      const m = measure(item.text), x = item.x + tx - (item.anchor === 'middle' ? m.width / 2 : (item.anchor === 'end') !== rtl ? m.width : 0), y = item.y + ty - (item.baseline === 'middle' ? m.height / 2 : item.baseline === 'hanging' ? 0 : m.baseline);
      obstacles.push({ key: item.key, box: { x, y, width: m.width, height: m.height } });
    } else if (item.kind === 'path' && item.presentation?.stroke && item.presentation.stroke.kind !== 'none') {
      let previous: readonly [number, number] | null = null;
      for (const command of item.commands) {
        if (command.kind === 'M') previous = [command.x + tx, command.y + ty];
        else if (command.kind === 'L' && previous) { segment(item.key, previous[0], previous[1], command.x + tx, command.y + ty); previous = [command.x + tx, command.y + ty]; }
        else previous = null;
      }
    }
  }
  return obstacles;
}
