import { expect, test } from 'vitest';
import type { ColumnChartSpec } from '../../src/public/column-types.js';
import type { ChartResult } from '../../src/public/chart-types.js';
import { validateColumn } from '../../src/column/validate.js';
import { normalizeColumn } from '../../src/column/normalize.js';
import { projectColumn, pickColumn } from '../../src/column/geometry.js';
import { projectStacked, pickStacked } from '../../src/stacked/geometry.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
const state = Object.freeze({ hiddenSeriesIds: Object.freeze([]) });
function input(horizontal: boolean): ColumnChartSpec {
  return { family: 'column', title: 'Stable duplicate categories', orientation: horizontal ? 'horizontal' : 'vertical', axes: { x: { type: 'category', values: [{ id: 'a', label: 'January' }, { id: 'b', label: 'January' }, { id: 'c', label: 'March' }] }, y: { type: 'linear' } }, series: [{ id: 'actual', name: 'Actual', data: [{ id: 'a1', x: 'a', y: 4 }, { id: 'b1', x: 'b', y: -2 }, { id: 'c1', x: 'c', y: 0 }] }, { id: 'target', name: 'Target', data: [{ id: 'a2', x: 'a', y: 2 }, { id: 'b2', x: 'b', y: 3 }, { id: 'c2', x: 'c', y: 5 }] }] };
}
for (const horizontal of [false, true]) {
  test('grouped viewport retains global category identity and translates its local band hit index; horizontal=' + horizontal, () => {
    const data = normalizeColumn(value(validateColumn(input(horizontal)))), plot = { x: 10, y: 10, width: 600, height: 300 };
    const projection = value(projectColumn(data, state, plot, [-5, 5], { firstId: 'b', lastId: 'c' }));
    expect(projection.categoryOffset).toBe(1); expect(projection.rects).toHaveLength(4); expect(projection.byCategory).toHaveLength(3);
    expect(projection.rects.every(rect => rect.categoryIndex === 1 || rect.categoryIndex === 2)).toBe(true);
    const first = projection.rects.find(rect => rect.point.id === 'b1')!;
    expect(pickColumn(projection, first.x + first.width / 2, first.y + first.height / 2)?.point.id).toBe('b1');
    expect(data.series.map(series => series.points.length)).toEqual([3, 3]);
    expect(value(projectColumn(data, state, plot, [-5, 5])).rects).toHaveLength(6);
  });
  test('stack viewport preserves full signed accumulation and segment identity; horizontal=' + horizontal, () => {
    const data = normalizeColumn(value(validateColumn(input(horizontal)))), plot = { x: 10, y: 10, width: 600, height: 300 };
    const projection = value(projectStacked(data, state, plot, [-5, 10], 'sum', { firstId: 'b', lastId: 'b' }));
    expect(projection.categoryOffset).toBe(1); expect(projection.rects).toHaveLength(2);
    expect(projection.rects.every(rect => rect.categoryIndex === 1 && rect.point.x === 'b')).toBe(true);
    const negative = projection.rects.find(rect => rect.point.id === 'b1')!;
    expect(pickStacked(projection, negative.x + negative.width / 2, negative.y + negative.height / 2)?.point.id).toBe('b1');
    expect(projection.byCategory[0]!.size).toBe(0); expect(projection.byCategory[1]!.size).toBe(2);
    expect(data.series.map(series => series.points.length)).toEqual([3, 3]);
  });
}
