import { expect, it } from 'vitest';
import { squarify, findTile, type Tiling } from '../../src/treemap/squarify.js';
const box = { x: 0, y: 0, width: 100, height: 100 };
function layout(weights: readonly number[], rect = box): Tiling { const result = squarify(weights.map((weight, index) => ({ id: 'n' + index.toString().padStart(5, '0'), index, weight })), rect); if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
function contained(data: Tiling): void {
  for (const tile of data.tiles) { const r = tile.rect; expect([r.x, r.y, r.width, r.height].every(Number.isFinite)).toBe(true); expect(r.width).toBeGreaterThan(0); expect(r.height).toBeGreaterThan(0); expect(r.x).toBeGreaterThanOrEqual(data.rect.x); expect(r.y).toBeGreaterThanOrEqual(data.rect.y); expect(r.x + r.width).toBeLessThanOrEqual(data.rect.x + data.rect.width); expect(r.y + r.height).toBeLessThanOrEqual(data.rect.y + data.rect.height); }
}
it('matches the independent two-equal golden and keeps zero weights semantic only', () => {
  expect(layout([1, 1]).tiles.map(tile => tile.rect)).toEqual([{ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 50, width: 100, height: 50 }]);
  const data = layout([4, 0]); expect(data.tiles.map(tile => tile.rect)).toEqual([box]); expect(data.unrepresented).toEqual([{ index: 1, reason: 'zero' }]);
  for (const tile of layout([1, 1, 1, 1]).tiles) expect(tile.rect.width * tile.rect.height).toBeCloseTo(2500, 8);
});
it('is deterministic under input reorder and uniform weight scaling without mutation', () => {
  const input = Object.freeze([8, 7, 7, 4, 2, 1].map((weight, index) => Object.freeze({ id: 'id' + index, index, weight }))), original = JSON.stringify(input);
  const a = squarify(input, box), b = squarify([...input].reverse(), box), c = squarify(input.map(node => ({ ...node, weight: node.weight * 1e100 })), box); expect(a.status).toBe('ok'); expect(b).toEqual(a); expect(JSON.stringify(input)).toBe(original);
  if (a.status === 'ok' && c.status === 'ok') for (const tile of a.value.tiles) { const other = c.value.tiles.find(item => item.id === tile.id)!; for (const key of ['x', 'y', 'width', 'height'] as const) expect(other.rect[key]).toBeCloseTo(tile.rect[key], 9); }
});
it('tiles without overlap or material area loss across deterministic varied distributions', () => {
  let state = 7391; const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  for (let sample = 0; sample < 80; sample++) {
    const weights = Array.from({ length: 1 + Math.floor(random() * 30) }, () => .001 + random() ** 3 * 1000), data = layout(weights, { x: 3, y: 7, width: 30 + random() * 900, height: 30 + random() * 500 }), total = weights.reduce((a, b) => a + b, 0), area = data.rect.width * data.rect.height; contained(data);
    expect(data.candidateChecks).toBeLessThanOrEqual(weights.length * 2); expect(data.tiles.reduce((sum, tile) => sum + tile.rect.width * tile.rect.height, 0) / area).toBeCloseTo(1, 11);
    for (let i = 0; i < data.tiles.length; i++) { const a = data.tiles[i]!.rect; expect(a.width * a.height / area).toBeCloseTo(weights[data.tiles[i]!.index]! / total, 10); for (let j = i + 1; j < data.tiles.length; j++) { const b = data.tiles[j]!.rect; const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); expect(overlap / area).toBeLessThan(1e-13); } }
  }
});
it('matches an independent linear rectangle oracle at centers, boundaries and random positions', () => {
  const data = layout([13, 8, 6, 6, 4, 3, 2, 1]);
  const contains = (r: typeof box, x: number, y: number) => x >= r.x && y >= r.y && (x < r.x + r.width || x === 100 && r.x + r.width === 100) && (y < r.y + r.height || y === 100 && r.y + r.height === 100);
  const points = [...data.tiles.flatMap(tile => [[tile.rect.x, tile.rect.y], [tile.rect.x + tile.rect.width / 2, tile.rect.y + tile.rect.height / 2]]), [100, 100], [-1, 50], [50, 101]];
  for (let i = 0; i < 500; i++) points.push([(i * 73 % 997) / 997 * 100, (i * 137 % 991) / 991 * 100]);
  for (const [x, y] of points) expect(findTile(data, x!, y!)?.id ?? null).toBe(data.tiles.find(tile => contains(tile.rect, x!, y!))?.id ?? null);
});
it('handles huge/tiny finite weights and explicitly reports unrepresentable screen area', () => {
  for (const weights of [[Number.MAX_VALUE / 2, Number.MAX_VALUE / 2], [Number.MIN_VALUE, Number.MIN_VALUE], [1e200, 1e-200, 1]]) { const data = layout(weights); contained(data); expect(data.tiles.length + data.unrepresented.length).toBe(weights.length); }
  const small = layout([1, 2], { x: 0, y: 0, width: 1e-200, height: 1e-200 }); expect(small.tiles).toHaveLength(0); expect(small.unrepresented).toHaveLength(2);
  const overflow = squarify([{ id: 'a', index: 0, weight: Number.MAX_VALUE }, { id: 'b', index: 1, weight: Number.MAX_VALUE }], box); expect(overflow.status).toBe('invalid');
  expect(layout([1, 2], { x: 1e200, y: 1e200, width: 1, height: 1 }).unrepresented).toHaveLength(2);
});
it('keeps candidate work bounded for10000 entries and does not use a quadratic row scan', () => {
  const weights = Array.from({ length: 10000 }, (_, i) => (i * 37) % 991 + 1), data = layout(weights, { x: 0, y: 0, width: 1200, height: 800 }); expect(data.candidateChecks).toBeLessThanOrEqual(20000); expect(data.tiles).toHaveLength(10000); contained(data);
});
