import { expect, test } from 'vitest';
import type { ChartResult } from '../../src/public/chart-types.js';
import { createCategoryFrame, createPointScale } from '../../src/internal/math/category.js';
import { categoryViewportAxis, numericViewportAxis, prepareViewport, panViewport, type Viewport } from '../../src/internal/interaction/viewport.js';
import { categoryZoomAnchor, categoryPanFraction, categoryBoxWindow } from '../../src/internal/interaction/viewport-category.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
const ids = ['a', 'b', 'c', 'd', 'e'];
function owner(initial: unknown = {}): Viewport { const model = value(prepareViewport({ mode: 'internal', axes: 'xy', initial }, { x: value(categoryViewportAxis(ids)), y: value(numericViewportAxis('linear', [0, 10])) })); if (!model) throw Error('Disabled owner'); return model; }
test('box endpoint inverse agrees with frozen category centers at zero, half and full edge spacing', () => {
  for (const spacing of [0, .5, 1]) {
    const scale = createPointScale(value(createCategoryFrame(ids, [20, 220], spacing)));
    ids.forEach(id => { const center = scale.center(id); if (center === null) throw Error(id); const fraction = (center - 20) / 200; expect(categoryBoxWindow(owner(), 'x', fraction, fraction, spacing)).toEqual({ firstId: id, lastId: id }); });
  }
});
test('a 20%-80% box follows actual zero-spaced centers and never changes the applied owner', () => {
  const current = owner(); expect(categoryBoxWindow(current, 'x', .2, .8, 0)).toEqual({ firstId: 'b', lastId: 'd' }); expect(current.value).toEqual({});
});
test('wheel anchors refer to logical point ranks independently of edge padding', () => {
  for (const spacing of [0, .5, 1]) {
    const scale = createPointScale(value(createCategoryFrame(ids, [0, 100], spacing)));
    ids.forEach((id, index) => expect(categoryZoomAnchor(owner(), 'x', scale.center(id)! / 100, spacing)).toBeCloseTo(index / 4, 12));
  }
});
test('a physical center-to-center pan translates one category in the current partial window', () => {
  for (const spacing of [0, .5, 1]) {
    const current = owner({ x: { firstId: 'a', lastId: 'd' } }), scale = createPointScale(value(createCategoryFrame(ids.slice(0, 4), [0, 100], spacing)));
    const delta = categoryPanFraction(current, 'x', (scale.center('b')! - scale.center('a')!) / 100, spacing);
    expect(value(panViewport(current, { x: delta })).value.x).toEqual({ firstId: 'b', lastId: 'e' });
  }
});
test('one-category windows keep a usable pan interval and stable identity', () => {
  const current = owner({ x: { firstId: 'c', lastId: 'c' } }); expect(categoryBoxWindow(current, 'x', 0, 1, 0)).toEqual({ firstId: 'c', lastId: 'c' }); expect(categoryZoomAnchor(current, 'x', .1, 0)).toBe(.5);
  expect(value(panViewport(current, { x: categoryPanFraction(current, 'x', 1, 0) })).value.x).toEqual({ firstId: 'd', lastId: 'd' });
});
test('numeric axes retain their own numeric interaction fractions', () => {
  const current = owner(); expect(categoryZoomAnchor(current, 'y', .7)).toBe(.7); expect(categoryPanFraction(current, 'y', -.2)).toBe(-.2); expect(categoryBoxWindow(current, 'y', .2, .8)).toBe(null);
});
