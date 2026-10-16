import { expect, test } from 'vitest';
import { categoryViewportAxis, numericViewportAxis, prepareViewport, requestViewport, sameViewport, zoomViewport, panViewport, type Viewport, type ViewportContext } from '../../src/internal/interaction/viewport.js';
import type { ChartResult } from '../../src/public/chart-types.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
const numeric = (low = 0, high = 100, kind: 'linear' | 'time' = 'linear') => value(numericViewportAxis(kind, [low, high]));
const context = (): ViewportContext => ({ x: numeric(), y: numeric(-50, 50) });
test('millisecond pan rounds one translation and preserves exact window duration at epoch extremes', () => {
  const limit = 8640000000000000;
  for (const initial of [[1, 2], [-2, -1], [-limit, -limit + 1], [limit - 2, limit - 1], [-limit, limit - 1]] as const) {
    const model = owner({ mode: 'internal', axes: 'x', initial: { x: initial } }, { x: numeric(-limit, limit, 'time'), y: numeric() });
    for (const delta of [-Number.MAX_VALUE, -20, -.75, -.5, -.25, 0, .25, .5, .75, 20, Number.MAX_VALUE]) {
      const result = value(panViewport(model, { x: delta })).value.x; if (!Array.isArray(result)) throw Error('Missing time window');
      expect(result.every(Number.isSafeInteger)).toBe(true); expect(result[0]).toBeGreaterThanOrEqual(-limit); expect(result[1]).toBeLessThanOrEqual(limit);
      expect(BigInt(result[1]) - BigInt(result[0])).toBe(BigInt(initial[1]) - BigInt(initial[0]));
    }
  }
  const model = owner({ mode: 'internal', axes: 'x', initial: { x: [1, 2] } }, { x: numeric(0, 10, 'time'), y: numeric() });
  expect(value(panViewport(model, { x: .25 })).value.x).toEqual([1, 2]); expect(value(panViewport(model, { x: .5 })).value.x).toEqual([2, 3]); expect(value(panViewport(model, { x: -.5 })).value.x).toEqual([0, 1]);
});
function owner(input: unknown = { mode: 'internal', axes: 'xy' }, bounds = context(), previous: Viewport | null = null): Viewport { const result = value(prepareViewport(input, bounds, previous)); if (!result) throw Error('Disabled owner'); return result; }

test('disabled configuration has no applied owner and full auto remains distinct from an explicit equal window', () => {
  expect(value(prepareViewport(undefined, context()))).toBe(null); expect(value(prepareViewport(false, context()))).toBe(null);
  const full = owner(); expect(full.value).toEqual({}); expect(full.resolved).toEqual({ x: [0, 100], y: [-50, 50] });
  expect(full.settings).toEqual({ mode: 'internal', axes: 'xy', gesture: 'none', wheel: false, controls: true });
  const explicit = value(requestViewport(full, { x: [0, 100] })); expect(sameViewport(full.value, explicit.value)).toBe(false);
  expect(value(requestViewport(explicit, {})).value).toEqual({}); expect(full.value).toEqual({});
});
test('requests own readonly window values without modifying or accepting a controlled owner', () => {
  const input = { mode: 'controlled', axes: 'xy', value: { x: [25, 75] } }, current = owner(input), proposed = value(requestViewport(current, { x: [40, 60], y: [-10, 10] }));
  input.value.x[0] = 0; expect(current.value).toEqual({ x: [25, 75] }); expect(proposed.value).toEqual({ x: [40, 60], y: [-10, 10] });
  expect(Object.isFrozen(proposed)).toBe(true); expect(Object.isFrozen(proposed.value)).toBe(true); expect(Object.isFrozen(proposed.value.x)).toBe(true); expect(Object.isFrozen(proposed.context)).toBe(true);
});
test('internal initial is consumed once; data changes intersect the actual current window, not stale initial bounds', () => {
  const config = { mode: 'internal', axes: 'x', initial: { x: [5, 95] } }, initial = owner(config), moved = value(requestViewport(initial, { x: [30, 80] }));
  const updated = owner(config, { x: numeric(40, 60), y: numeric() }, moved); expect(updated.value).toEqual({ x: [40, 60] });
  expect(owner(config, { x: numeric(100, 200), y: numeric() }, moved).value).toEqual({});
  expect(moved.value).toEqual({ x: [30, 80] }); expect(initial.value).toEqual({ x: [5, 95] });
});
test('controlled invalid window/data updates reject atomically and an explicit mode change starts a new owner', () => {
  const current = owner({ mode: 'controlled', axes: 'x', value: { x: [25, 75] } });
  expect(prepareViewport({ mode: 'controlled', axes: 'x', value: current.value }, { x: numeric(40, 60), y: numeric() }, current).status).toBe('invalid');
  expect(current.value).toEqual({ x: [25, 75] });
  expect(owner({ mode: 'internal', axes: 'x', initial: { x: [45, 55] } }, context(), current).value).toEqual({ x: [45, 55] });
});
test('duplicate visible category labels have independent stable IDs and endpoint removal resets to full data', () => {
  const x = value(categoryViewportAxis(['jan-1', 'jan-2', 'feb'])), current = owner({ mode: 'internal', axes: 'x', initial: { x: { firstId: 'jan-1', lastId: 'jan-2' } } }, { x, y: numeric() });
  expect(value(panViewport(current, { x: 1 })).value.x).toEqual({ firstId: 'jan-2', lastId: 'feb' });
  expect(value(zoomViewport(current, 2)).value.x).toEqual({ firstId: 'jan-1', lastId: 'jan-1' });
  expect(owner({ mode: 'internal', axes: 'x' }, { x: value(categoryViewportAxis(['jan-2', 'feb'])), y: numeric() }, current).value).toEqual({});
  expect(prepareViewport({ mode: 'controlled', axes: 'x', value: { x: { firstId: 'jan-1', lastId: 'jan-2' } } }, { x: value(categoryViewportAxis(['jan-2', 'feb'])), y: numeric() }, current).status).toBe('invalid');
});
test('numeric zoom/pan respects independent XY windows, bounds and explicit reset', () => {
  const current = owner(), zoomed = value(zoomViewport(current, 2, { x: .25, y: .75 }));
  expect(zoomed.value).toEqual({ x: [12.5, 62.5], y: [-12.5, 37.5] });
  expect(value(panViewport(zoomed, { x: 100, y: -100 })).value).toEqual({ x: [50, 100], y: [-50, 0] });
  expect(value(requestViewport(zoomed, {})).resolved).toEqual(current.resolved);
  expect(current.value).toEqual({});
});
test('automatic visible extent is derived separately from stable allowed data bounds', () => {
  const current = owner({ mode: 'internal', axes: 'x' }, { x: value(numericViewportAxis('linear', [0, 100], [0, 10])), y: numeric() });
  expect(current.value).toEqual({}); expect(current.resolved.x).toEqual([0, 10]);
  expect(value(zoomViewport(current, 2)).value.x).toEqual([2.5, 7.5]);
  expect(value(requestViewport(current, { x: [75, 100] })).value.x).toEqual([75, 100]);
  expect(numericViewportAxis('linear', [0, 100], [-1, 10]).status).toBe('invalid');
});
test('zero pan and unit zoom preserve implicit auto state instead of silently locking an explicit full window', () => {
  const current = owner();
  expect(value(panViewport(current, { x: 0, y: 0 })).value).toEqual({});
  expect(value(zoomViewport(current, 1)).value).toEqual({});
  const explicit = value(requestViewport(current, { x: [20, 40] }));
  expect(value(panViewport(explicit, { x: 0 })).value).toEqual(explicit.value);
});
test('time windows are finite integer epoch milliseconds and minimum windows remain representable', () => {
  const bounds = { x: numeric(0, 100, 'time'), y: numeric() }, current = owner({ mode: 'internal', axes: 'x' }, bounds);
  expect(value(zoomViewport(current, 3)).value.x).toEqual([33, 67]);
  const tiny = owner({ mode: 'internal', axes: 'x', initial: { x: [0, 1] } }, bounds);
  expect(value(zoomViewport(tiny, 1000)).value.x).toEqual([0, 1]);
  expect(requestViewport(current, { x: [.5, 1] }).status).toBe('invalid');
  expect(numericViewportAxis('time', [-8640000000000001, 0]).status).toBe('invalid');
});
test('empty domains remain valid automatic state with disabled actions, never fabricated numeric/category windows', () => {
  const current = owner({ mode: 'internal', axes: 'xy' }, { x: value(categoryViewportAxis([])), y: value(numericViewportAxis('linear', null)) });
  expect(current.value).toEqual({}); expect(current.resolved).toEqual({}); expect(zoomViewport(current, 2).status).toBe('invalid'); expect(requestViewport(current, { y: [0, 1] }).status).toBe('invalid');
});
test('invalid config, reversed/nonfinite/foreign windows and double owners reject without evaluating getters', () => {
  const bounds = context();
  for (const input of [null, true, {}, { mode: 'internal', axes: 'z' }, { mode: 'internal', axes: 'x', wheel: 1 }, { mode: 'internal', axes: 'x', value: {} }, { mode: 'controlled', axes: 'x', initial: {}, value: {} }, { mode: 'controlled', axes: 'x' }, { mode: 'internal', axes: 'x', initial: { y: [0, 1] } }, { mode: 'internal', axes: 'x', initial: { x: [20, 10] } }]) expect(prepareViewport(input, bounds).status).toBe('invalid');
  let reads = 0; const getter = Object.defineProperty({}, 'x', { enumerable: true, get() { reads++; return [0, 1]; } });
  const current = owner(); for (const input of [getter, { x: [NaN, 1] }, { x: [-1, 1] }, { x: [0, Infinity] }, { x: [0, 1, 2] }, { x: { firstId: 'a', lastId: 'a' } }, { extra: [0, 1] }]) expect(requestViewport(current, input).status).toBe('invalid');
  expect(reads).toBe(0); expect(categoryViewportAxis(['a', 'a']).status).toBe('invalid');
  expect(zoomViewport(current, NaN).status).toBe('invalid'); expect(panViewport(current, { x: Infinity }).status).toBe('invalid');
});
