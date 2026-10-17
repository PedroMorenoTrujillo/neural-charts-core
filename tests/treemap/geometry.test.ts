import { expect, it } from 'vitest';
import { validateHierarchy } from '../../src/treemap/hierarchy.js';
import { projectTreemap, pickTree, navigateTree, reconcileTree } from '../../src/treemap/geometry.js';
const raw = { id: 'root', children: [{ id: 'team-b', children: [{ id: 'b1', value: 4 }, { id: 'b0', value: 0 }, { id: 'bm', value: null }] }, { id: 'team-a', children: [{ id: 'a2', value: 3 }, { id: 'a1', value: 7 }] }] };
const plot = { x: 12, y: 6, width: 720, height: 340 };
function project(input: unknown = raw, bounds = plot) { const parsed = validateHierarchy(input); if (parsed.status !== 'ok') throw Error(JSON.stringify(parsed)); const p = projectTreemap(parsed.value, bounds, 12, true); if (p.status !== 'ok') throw Error(JSON.stringify(p)); return p.value; }
it('tiles each nested interior without confusing group/header area with leaf proportions', () => {
  const p = project(); expect(p.targets).toHaveLength(8); expect(p.byId.get('root')!.header).not.toBeNull(); expect(p.byId.get('root')!.record.weight).toBe(14);
  for (const node of p.targets) if (node.rect && node.record.parent !== null) { const parent = p.targets[node.record.parent]!, box = p.layouts.get(node.record.parent)!.rect; expect(node.rect.x).toBeGreaterThanOrEqual(box.x); expect(node.rect.y).toBeGreaterThanOrEqual(box.y); expect(node.rect.x + node.rect.width).toBeLessThanOrEqual(box.x + box.width); expect(node.rect.y + node.rect.height).toBeLessThanOrEqual(box.y + box.height); expect(node.rect.y).toBeGreaterThan(parent.header!.y); }
  for (const layout of p.layouts.values()) expect(layout.tiles.reduce((sum, tile) => sum + tile.rect.width * tile.rect.height, 0) / (layout.rect.width * layout.rect.height)).toBeCloseTo(1, 10);
});
it('retains zero/missing targets with their original identity and an explicit nonvisual reason', () => {
  const p = project(); for (const id of ['b0', 'bm']) { const target = p.byId.get(id)!; expect(target.rect).toBe(null); expect(target.reason).toBe(id === 'bm' ? 'missing' : 'zero'); expect([target.anchor.x, target.anchor.y].every(Number.isFinite)).toBe(true); }
  expect(p.byId.get('bm')!.record.node.value).toBe(null); expect(p.byId.get('b0')!.record.node.value).toBe(0);
});
it('navigates siblings, parent/child, level endpoints and chart endpoints without DOM order', () => {
  const p = project(), root = p.targets[0]!, team = navigateTree(p, root, 'ArrowRight', false)!; expect(team.record.node.id).toBe('team-a');
  const a1 = navigateTree(p, team, 'ArrowRight', false)!; expect(a1.record.node.id).toBe('a1'); expect(navigateTree(p, a1, 'ArrowDown', false)!.record.node.id).toBe('a2'); expect(navigateTree(p, a1, 'End', false)!.record.node.id).toBe('a2'); expect(navigateTree(p, a1, 'ArrowLeft', false)!.record.node.id).toBe('team-a');
  expect(navigateTree(p, a1, 'Home', true)!.record.node.id).toBe('root'); expect(navigateTree(p, root, 'End', true)!.record.node.id).toBe('bm'); expect(navigateTree(p, root, 'ArrowUp', false)).toBe(root);
});
it('restores logical identity after reconstruction and recovers a deleted node by canonical order', () => {
  const before = project(), old = before.byId.get('a2')!, clone = structuredClone(raw); clone.children.reverse(); const after = project(clone);
  expect(reconcileTree(after, old.record.node.id, old.order)!.record.node.id).toBe('a2'); expect(after.byId.get('a2')!.rect).toEqual(old.rect); expect(after.byId.get('a2')).not.toBe(old);
  clone.children[0]!.children = clone.children[0]!.children.filter(node => node.id !== 'a2'); const removed = project(clone); expect(reconcileTree(removed, 'a2', old.order)).not.toBe(null); expect(reconcileTree(removed, 'a2', old.order)!.record.node.id).not.toBe('a2');
});
it('matches an independent deepest-painted-rectangle oracle including group headers and gaps', () => {
  const p = project(), candidates = [...p.targets].filter(target => target.paint).sort((a, b) => b.record.depth - a.record.depth);
  const points = p.targets.flatMap(target => target.paint ? [[target.paint.x + target.paint.width / 2, target.paint.y + target.paint.height / 2]] : []); for (let i = 0; i < 800; i++) points.push([plot.x + (i * 37 % 997) / 997 * plot.width, plot.y + (i * 73 % 991) / 991 * plot.height]);
  for (const [x, y] of points) { const expected = candidates.find(({ paint: r }) => x! >= r!.x && y! >= r!.y && x! < r!.x + r!.width && y! < r!.y + r!.height); expect(pickTree(p, x!, y!)?.record.node.id ?? null).toBe(expected?.record.node.id ?? null); }
  expect(pickTree(p, -100, -100)).toBe(null); expect(pickTree(p, NaN, 0)).toBe(null);
});
it('keeps depth and candidate work bounded when descendants lose representable space', () => {
  let root: unknown = { id: 'leaf', value: 1 }; for (let i = 0; i < 64; i++) root = { id: 'n' + i, children: [root] }; const p = project(root, { x: 1000, y: 1000, width: 10, height: 10 });
  expect(p.targets).toHaveLength(65); expect(p.candidateChecks).toBeLessThanOrEqual(128); expect(p.unrepresented).toBeGreaterThan(0); expect(p.targets.every(target => [target.anchor.x, target.anchor.y].every(Number.isFinite))).toBe(true);
  const empty = project(raw, { x: 0, y: 0, width: 0, height: 100 }); expect(empty.targets.every(target => target.paint === null)).toBe(true); expect(empty.targets).toHaveLength(8);
});
