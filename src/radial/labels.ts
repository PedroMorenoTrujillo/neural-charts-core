import type { ChartResult } from '../public/chart-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
type Point = Readonly<{ x: number; y: number }>;
type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type RadialLabelCandidate = Readonly<{ id: string; text: string; side: 'left' | 'right'; idealY: number; x: number; width: number; height: number; priority: number; anchor: Point; elbow: Point }>;
export type RadialLabel = Readonly<{ id: string; text: string; side: 'left' | 'right'; box: Bounds; leader: readonly [Point, Point, Point] }>;
const orderId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function orientation(a: Point, b: Point, c: Point): number { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const ac = orientation(a, b, c), ad = orientation(a, b, d), ca = orientation(c, d, a), cb = orientation(c, d, b);
  const between = (p: Point, q: Point, r: Point) => r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x) && r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y);
  return Math.sign(ac) * Math.sign(ad) < 0 && Math.sign(ca) * Math.sign(cb) < 0 || ac === 0 && between(a, b, c) || ad === 0 && between(a, b, d) || ca === 0 && between(c, d, a) || cb === 0 && between(c, d, b);
}
export function layoutRadialLabels(candidates: readonly RadialLabelCandidate[], bounds: Bounds): ChartResult<readonly RadialLabel[]> {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 0 || bounds.height < 0 || candidates.length > 10000) return invalid('INVALID_CONFIG', 'BAD_LABEL_BOUNDS', 'radial.labels');
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.id || ids.has(candidate.id) || ![candidate.idealY, candidate.x, candidate.width, candidate.height, candidate.priority, candidate.anchor.x, candidate.anchor.y, candidate.elbow.x, candidate.elbow.y].every(Number.isFinite) || candidate.width < 0 || candidate.height <= 0 || (candidate.side !== 'left' && candidate.side !== 'right')) return invalid('INVALID_CONFIG', 'BAD_LABEL', 'radial.labels');
    ids.add(candidate.id);
  }
  const priority = (a: RadialLabelCandidate, b: RadialLabelCandidate) => b.priority - a.priority || orderId(a.id, b.id), gap = 4;
  const inside = (point: Point) => point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
  const bounded = [...candidates].filter(candidate => candidate.x >= bounds.x && candidate.x + candidate.width <= bounds.x + bounds.width && candidate.height <= bounds.height && inside(candidate.anchor) && inside(candidate.elbow)).sort(priority).slice(0, 200);
  const placed: { candidate: RadialLabelCandidate; label: RadialLabel }[] = [];
  for (const side of ['left', 'right'] as const) {
    const selected = bounded.filter(candidate => candidate.side === side);
    let height = selected.reduce((sum, candidate) => sum + candidate.height, 0) + Math.max(0, selected.length - 1) * gap;
    // Highest priorities were retained first. Removing from the end is bounded
    // by the fixed 200-label budget and never removes a domain observation.
    while (selected.length && height > bounds.height) { height -= selected.pop()!.height + (selected.length ? gap : 0); }
    selected.sort((a, b) => a.idealY - b.idealY || orderId(a.id, b.id));
    const tops: number[] = []; let cursor = bounds.y;
    for (const candidate of selected) { const y = Math.max(cursor, candidate.idealY - candidate.height / 2); tops.push(y); cursor = y + candidate.height + gap; }
    cursor = bounds.y + bounds.height;
    for (let i = selected.length - 1; i >= 0; i--) { tops[i] = Math.min(tops[i]!, cursor - selected[i]!.height); cursor = tops[i]! - gap; }
    for (let i = 0; i < selected.length; i++) {
      const candidate = selected[i]!, y = tops[i]!, edge = { x: side === 'left' ? candidate.x + candidate.width : candidate.x, y: y + candidate.height / 2 };
      placed.push({ candidate, label: Object.freeze({ id: candidate.id, text: candidate.text, side, box: Object.freeze({ x: candidate.x, y, width: candidate.width, height: candidate.height }), leader: Object.freeze([candidate.anchor, candidate.elbow, edge] as const) }) });
    }
  }
  // Higher-priority labels win a connector crossing. Layout is not re-relaxed:
  // removing a label preserves all remaining separation and order guarantees.
  placed.sort((a, b) => priority(a.candidate, b.candidate));
  const accepted: RadialLabel[] = [];
  for (const { label } of placed) {
    if (accepted.some(previous => previous.side === label.side && [0, 1].some(a => [0, 1].some(b => crosses(previous.leader[a]!, previous.leader[a + 1]!, label.leader[b]!, label.leader[b + 1]!))))) continue;
    accepted.push(label);
  }
  return ok(Object.freeze(accepted.sort((a, b) => orderId(a.id, b.id))));
}
