type Vertex = Readonly<{x: number; y: number}>;
type Plot = Readonly<{x: number; y: number; width: number; height: number}>;

function ratio(value: number, from: number, to: number): number {
  return Number.isFinite(to - from) && Number.isFinite(value - from)
    ? (value - from) / (to - from)
    : (value / 2 - from / 2) / (to / 2 - from / 2);
}

/** Clip a connector without overflowing when its original endpoints are far outside the plot. */
export function clipGraphSegment(a: Vertex, b: Vertex, plot: Plot): readonly [Vertex, Vertex] | null {
  let first = 0, last = 1;
  for (const [axis, low, high] of [['x', plot.x, plot.x + plot.width], ['y', plot.y, plot.y + plot.height]] as const) {
    if (a[axis] === b[axis]) {
      if (a[axis] < low || a[axis] > high) return null;
      continue;
    }
    const u = ratio(low, a[axis], b[axis]), v = ratio(high, a[axis], b[axis]);
    first = Math.max(first, Math.min(u, v));
    last = Math.min(last, Math.max(u, v));
    if (last <= first) return null;
  }
  const at = (t: number): Vertex => ({
    x: Math.max(plot.x, Math.min(plot.x + plot.width, a.x * (1 - t) + b.x * t)),
    y: Math.max(plot.y, Math.min(plot.y + plot.height, a.y * (1 - t) + b.y * t)),
  });
  const start = at(first), end = at(last);
  return start.x === end.x && start.y === end.y ? null : [start, end];
}

export function boundedGraphLabel(label: string, width: number): string {
  const characters = Array.from(label), capacity = Math.max(1, Math.floor(width / 7));
  return characters.length <= capacity ? label : characters.slice(0, Math.max(1, capacity - 1)).join('') + '…';
}
