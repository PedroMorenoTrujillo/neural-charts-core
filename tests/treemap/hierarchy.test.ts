import { expect, it } from 'vitest';
import { validateHierarchy } from '../../src/treemap/hierarchy.js';
it('aggregates only leaves, preserves null/zero, and exposes stable canonical sibling order', () => {
  const raw = Object.freeze({ id: 'root', children: Object.freeze([{ id: 'z', value: 0 }, { id: 'b', children: [{ id: 'leaf', value: 2 }, { id: 'missing', value: null }] }, { id: 'a', value: 2 }]) });
  const original = JSON.stringify(raw), result = validateHierarchy(raw); expect(result.status).toBe('ok'); if (result.status !== 'ok') return;
  const data = result.value; expect(data.nodes[0]!.weight).toBe(4); expect(data.nodes[0]!.missing).toBe(true); expect(data.order.map(i => data.nodes[i]!.node.id)).toEqual(['root', 'a', 'b', 'leaf', 'missing', 'z']); expect(data.nodes[data.byId.get('z')!]!.weight).toBe(0); expect(JSON.stringify(raw)).toBe(original); expect(Object.isFrozen(data.root.children)).toBe(true);
});
it('rejects missing root, malformed node kinds, negative/nonfinite leaves and duplicate global IDs', () => {
  for (const raw of [null, undefined, {}, { id: 'r' }, { id: 'r', children: [], value: 0 }, { id: 'r', value: -1 }, ...[NaN, Infinity, undefined].map(value => ({ id: 'r', value })), { id: 'r', children: [{ id: 'a', value: 1 }, { id: 'a', value: 2 }] }, { id: 'r', children: [], colorValue: 3 }, { id: 'r', children: new Array(3) }]) expect(validateHierarchy(raw).status).toBe('invalid');
});
it('detects cycles and repeated object references without recursion or consumer accessors', () => {
  const cycle: { id: string; children: unknown[] } = { id: 'root', children: [] }; cycle.children.push(cycle); expect(validateHierarchy(cycle).status).toBe('invalid');
  const leaf = { id: 'a', value: 1 }; expect(validateHierarchy({ id: 'root', children: [{ id: 'b', children: [leaf] }, { id: 'c', children: [leaf] }] }).status).toBe('invalid');
  let calls = 0; const raw = { id: 'root', get children() { calls++; throw Error('Forbidden getter'); } }; expect(validateHierarchy(raw).status).toBe('invalid'); expect(calls).toBe(0);
  const datum = Object.freeze({ get payload() { calls++; throw Error('Opaque payload'); } }); const result = validateHierarchy({ id: 'root', value: 1, datum }); expect(result.status).toBe('ok'); if (result.status === 'ok') expect(result.value.root.datum).toBe(datum); expect(calls).toBe(0);
});
it('enforces explicit size/depth bounds and accepts deep input without a language stack traversal', () => {
  let root: unknown = { id: 'leaf', value: 1 }; for (let i = 0; i < 64; i++) root = { id: 'n' + i, children: [root] }; expect(validateHierarchy(root).status).toBe('ok');
  expect(validateHierarchy({ id: 'too-deep', children: [root] }).status).toBe('invalid');
  expect(validateHierarchy({ id: 'root', children: Array.from({ length: 10000 }, (_, i) => ({ id: 'n' + i, value: 1 })) }).status).toBe('invalid');
  expect(validateHierarchy({ id: 'root', children: Array.from({ length: 9999 }, (_, i) => ({ id: 'n' + i, value: 1 })) }).status).toBe('ok');
});
it('handles finite extreme/subnormal totals and rejects overflow rather than returning false totals', () => {
  const result = validateHierarchy({ id: 'root', children: [{ id: 'a', value: Number.MAX_VALUE / 2 }, { id: 'b', value: Number.MAX_VALUE / 2 }] }); expect(result.status).toBe('ok'); if (result.status === 'ok') expect(result.value.nodes[0]!.weight).toBe(Number.MAX_VALUE);
  const tiny = validateHierarchy({ id: 'root', children: [{ id: 'a', value: Number.MIN_VALUE }, { id: 'b', value: Number.MIN_VALUE }] }); expect(tiny.status).toBe('ok'); if (tiny.status === 'ok') expect(tiny.value.nodes[0]!.weight).toBe(2 * Number.MIN_VALUE);
  const overflow = validateHierarchy({ id: 'root', children: [{ id: 'a', value: Number.MAX_VALUE }, { id: 'b', value: Number.MAX_VALUE }] }); expect(overflow.status).toBe('invalid'); if (overflow.status === 'invalid') expect(overflow.diagnostic.reason).toBe('HIERARCHY_SUM_OVERFLOW');
});
it('keeps an empty branch and independent leaf color metrics without invented size weights', () => {
  const result = validateHierarchy({ id: 'root', children: [{ id: 'empty', children: [] }, { id: 'a', value: 10, colorValue: -5 }, { id: 'b', value: 2, colorValue: null }, { id: 'c', value: 3 }] }); expect(result.status).toBe('ok'); if (result.status !== 'ok') return;
  expect(result.value.nodes[0]!.weight).toBe(15); expect(result.value.colorExtent).toEqual([-5, 3]); expect(result.value.nodes[result.value.byId.get('empty')!]!.weight).toBe(0); expect(result.value.nodes[result.value.byId.get('b')!]!.colorValue).toBe(null);
});
