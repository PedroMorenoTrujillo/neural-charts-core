import { expect, test } from 'vitest';
import type { ChartResult } from '../../src/public/chart-types.js';
import { numericViewportAxis, prepareViewport, type Viewport } from '../../src/internal/interaction/viewport.js';
import { zoomDisplayedViewport, panDisplayedViewport } from '../../src/internal/interaction/viewport-display.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
function owner(x: readonly [number, number], y: readonly [number, number], initial: unknown = {}, type: 'linear' | 'time' = 'linear'): Viewport {
  const model = value(prepareViewport({ mode: 'internal', axes: 'xy', initial }, { x: value(numericViewportAxis(type, x)), y: value(numericViewportAxis('linear', y)) })); if (!model) throw Error('Disabled owner'); return model;
}
test('zoom follows displayed nice-axis extents and then intersects the original permitted bounds', () => {
  const model = owner([-2, 3], [-4, 5]);
  expect(value(zoomDisplayedViewport(model, { x: [-5, 5], y: [-5, 5] }, 2)).value).toEqual({ x: [-2, 2.5], y: [-2.5, 2.5] });
  expect(model.value).toEqual({}); expect(model.context.y).toEqual({ type: 'linear', domain: [-4, 5], automatic: [-4, 5] });
});
test('an off-center wheel anchor stays at its actual displayed value', () => {
  const model = owner([-10, 10], [-4, 5]);
  expect(value(zoomDisplayedViewport(model, { x: [-10, 10], y: [-5, 5] }, 2, { x: .25, y: .75 })).value).toEqual({ x: [-7.5, 2.5], y: [-1.25, 3.75] });
});
test('pan fits against true bounds while preserving a representable window span', () => {
  const model = owner([0, 10], [0, 10], { x: [1, 3], y: [1, 3] });
  expect(value(panDisplayedViewport(model, { x: [1, 3], y: [1, 3] }, { x: -2, y: 10 })).value).toEqual({ x: [0, 2], y: [8, 10] });
});
test('tiny applied windows survive display conversion inside extreme finite full bounds', () => {
  const model = owner([-Number.MAX_VALUE, Number.MAX_VALUE], [-1, 1], { x: [1, 2] });
  expect(value(panDisplayedViewport(model, { x: [1, 2], y: [-1, 1] }, { x: .25 })).value).toEqual({ x: [1.25, 2.25] });
});
test('display transforms retain integer time windows and reject invalid zoom factors', () => {
  const model = owner([0, 100], [-1, 1], {}, 'time');
  expect(value(zoomDisplayedViewport(model, { x: [0, 100], y: [-1, 1] }, 3)).value.x).toEqual([33, 67]);
  expect(zoomDisplayedViewport(model, { x: [0, 100], y: [-1, 1] }, NaN).status).toBe('invalid');
});
