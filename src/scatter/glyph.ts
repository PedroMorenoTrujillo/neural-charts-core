import type { PathCommand } from '../internal/geometry/path.js';
import type { ScatterMarkerShape } from '../public/scatter-types.js';
/** Independent closed marker contours; batching never connects observations. */
export function markerContour(shape: ScatterMarkerShape, x: number, y: number, r: number): readonly PathCommand[] {
  if (shape === 'circle') return [{ kind: 'M', x: x - r, y }, { kind: 'A', radius: r, largeArc: 0, sweep: 1, x: x + r, y }, { kind: 'A', radius: r, largeArc: 0, sweep: 1, x: x - r, y }, { kind: 'Z' }];
  if (shape === 'square') return [{ kind: 'M', x: x - r, y: y - r }, { kind: 'L', x: x + r, y: y - r }, { kind: 'L', x: x + r, y: y + r }, { kind: 'L', x: x - r, y: y + r }, { kind: 'Z' }];
  return [{ kind: 'M', x, y: y - r }, { kind: 'L', x: x + r, y }, { kind: 'L', x, y: y + r }, { kind: 'L', x: x - r, y }, { kind: 'Z' }];
}
