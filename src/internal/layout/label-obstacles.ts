import type { Plot as Rect } from './frame.js';
export type LabelObstacle = Readonly<{ key: string; box: Rect; segment?: readonly [number, number, number, number] }>;
function crosses(segment: readonly [number, number, number, number], box: Rect): boolean {
  let first = 0, last = 1;
  for (let axis = 0; axis < 2; axis++) {
    const origin = axis ? segment[1] : segment[0], end = axis ? segment[3] : segment[2], low = (axis ? box.y : box.x) - 2, high = (axis ? box.y + box.height : box.x + box.width) + 2;
    const delta = end - origin;
    if (!delta) { if (origin < low || origin > high) return false; continue; }
    const a = (low - origin) / delta, b = (high - origin) / delta;
    first = Math.max(first, Math.min(a, b)); last = Math.min(last, Math.max(a, b));
    if (first > last) return false;
  }
  return true;
}
/** A sorted interval envelope indexes the category direction. No raw-data
 * mutation, DOM measurement, or separate observer/listener per datum. */
export function labelObstacles(items: readonly LabelObstacle[], horizontal = false): (box: Rect, ownKey: string) => boolean {
  const axis = horizontal ? 'y' : 'x', size = horizontal ? 'height' : 'width';
  const sorted = [...items].sort((a, b) => a.box[axis] - b.box[axis]), maxima: number[] = [];
  const build = (low: number, high: number): number => {
    if (low >= high) return -Infinity;
    const middle = (low + high) >>> 1, item = sorted[middle]!;
    return maxima[middle] = Math.max(item.box[axis] + item.box[size], build(low, middle), build(middle + 1, high));
  };
  build(0, sorted.length);
  return (box, ownKey) => {
    const start = box[axis] - 2, end = box[axis] + box[size] + 2;
    const visit = (low: number, high: number): boolean => {
      if (low >= high) return false;
      const middle = (low + high) >>> 1;
      if (maxima[middle]! < start || sorted[low]!.box[axis] > end) return false;
      if (visit(low, middle)) return true;
      const item = sorted[middle]!, other = item.box;
      if (other[axis] > end) return false;
      if (item.key !== ownKey && box.x <= other.x + other.width + 2 && box.x + box.width >= other.x - 2 && box.y <= other.y + other.height + 2 && box.y + box.height >= other.y - 2 && (!item.segment || crosses(item.segment, box))) return true;
      return visit(middle + 1, high);
    };
    return visit(0, sorted.length);
  };
}
