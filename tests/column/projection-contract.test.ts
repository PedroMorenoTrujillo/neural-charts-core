import { describe, expect, it } from 'vitest';
import { navigateColumn, pickColumn, projectColumn, reconcileColumn } from '../../src/column/geometry.js';
import { normalizeColumn } from '../../src/column/normalize.js';
import { validateColumn } from '../../src/column/validate.js';
import { pickStacked, projectStacked } from '../../src/stacked/geometry.js';
import type { ChartState } from '../../src/public/chart-types.js';

const plot = {x: 18, y: 16, width: 300, height: 140};
const visibility: ChartState = {hiddenSeriesIds: []};
const domain = [-10, 10] as const;
const source = {
  family: 'column', title: 'Balances', maxBarWidth: 18,
  axes: { x: {type: 'category', values: [{id: 'a'}, {id: 'b'}, {id: 'c'}]}, y: {type: 'linear'} },
  series: [
    { id: 'north', name: 'North', data: [{id: 'n1', x: 'a', y: 8}, {id: 'n2', x: 'b', y: -4}, {id: 'n3', x: 'c', y: 2}] },
    { id: 'empty', name: 'Empty', data: [{id: 'e1', x: 'a', y: null}] },
    { id: 'south', name: 'South', data: [{id: 's1', x: 'a', y: 3}, {id: 's3', x: 'c', y: 0}] },
  ],
};
function normalized(spec: unknown) {
  const validated = validateColumn(spec);
  if (validated.status === 'invalid') throw Error(JSON.stringify(validated.diagnostic));
  return normalizeColumn(validated.value);
}
const data = normalized(source);
function projection(window?: {firstId: string; lastId: string}, state = visibility) {
  const result = projectColumn(data, state, plot, domain, window);
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  return result.value;
}

describe('column geometry retains navigation and hit identity', () => {
  it('navigates across missing rows and breaks category ties in source order', () => {
    const complete = projection(), [north, empty, south] = complete.rows;
    expect(empty).toEqual([]);
    expect(navigateColumn(complete, null, 'ArrowRight')).toBe(north![0]);
    expect(navigateColumn(complete, north![1]!, 'ArrowDown')).toBe(south![0]);
    expect(navigateColumn(complete, south![0]!, 'ArrowUp')).toBe(north![0]);
    expect(navigateColumn(complete, north![1]!, 'Home')).toBe(north![0]);
    expect(navigateColumn(complete, north![1]!, 'End')).toBe(north![2]);
    expect(navigateColumn(complete, north![1]!, 'End', true)).toBe(south![1]);
    expect(navigateColumn(complete, south![1]!, 'Home', true)).toBe(north![0]);
    expect(navigateColumn(complete, south![1]!, 'Tab')).toBe(south![1]);
    expect(navigateColumn(complete, south![1]!, 'ArrowDown')).toBe(south![1]);
  });

  it('reconciles a removed hovered category or series to the surviving original identity', () => {
    const complete = projection();
    const last = complete.rows[2]![1]!;
    const afterWindow = projection({firstId: 'a', lastId: 'b'});
    expect(reconcileColumn(afterWindow, last)).toBe(afterWindow.rows[2]![0]);
    expect(reconcileColumn(afterWindow, null)).toBe(afterWindow.rects[0]);
    const afterHidden = projection(undefined, {hiddenSeriesIds: ['south']});
    expect(reconcileColumn(afterHidden, last)).toBe(afterHidden.rows[0]![0]);
    const blank = projection(undefined, {hiddenSeriesIds: ['north', 'empty', 'south']});
    expect(navigateColumn(blank, null, 'Home')).toBeNull();
    expect(reconcileColumn(blank, last)).toBeNull();
  });

  it.each(['vertical', 'horizontal'] as const)('selects a stack zero inside its hit slop in a %s chart', orientation => {
    const input = normalized({...source, orientation, axes: {...source.axes, y: {...source.axes.y, reversed: true}}});
    const result = projectStacked(input, visibility, plot, domain, 'sum');
    if (result.status !== 'ok') throw Error(result.diagnostic.reason);
    const target = result.value.rects.find(rect => rect.point.id === 's3')!;
    const {x, y} = target.anchor;
    expect(target.point.y).toBe(0);
    const zeroOnly = projectStacked(input, {hiddenSeriesIds: ['north']}, plot, domain, 'sum');
    if (zeroOnly.status !== 'ok') throw Error(zeroOnly.diagnostic.reason);
    // A visible segment touching the baseline wins ahead of the zero segment.
    expect(pickStacked(result.value, x, y)?.point.id).toBe('n3');
    const zero = zeroOnly.value.rects.find(rect => rect.point.id === 's3')!.anchor;
    expect(pickStacked(zeroOnly.value, zero.x + (orientation === 'horizontal' ? 1 : 0), zero.y + (orientation === 'horizontal' ? 0 : 1))?.point.id).toBe('s3');
    expect(pickStacked(zeroOnly.value, NaN, y)).toBeNull();
    expect(pickStacked(zeroOnly.value, plot.x, plot.y)).toBeNull();
    expect(pickStacked(zeroOnly.value, x + (orientation === 'horizontal' ? 50 : 0), y + (orientation === 'horizontal' ? 0 : 50))).toBeNull();
  });
});

describe('column renderer handoff rejects invalid projections', () => {
  const valid = projection();

  it('rejects unknown viewport IDs and incompatible numeric domains across grouped and stacked geometry', () => {
    const window = {firstId: 'missing', lastId: 'b'};
    for (const result of [
      projectColumn(data, visibility, plot, domain, window),
      projectStacked(data, visibility, plot, domain, 'sum', window),
    ]) expect(result).toMatchObject({status: 'invalid', diagnostic: {path: 'viewport.x'}});
    for (const result of [
      projectColumn(data, visibility, plot, [3, 2]),
      projectStacked(data, visibility, plot, [3, 2], 'sum'),
    ]) expect(result).toMatchObject({status: 'invalid', diagnostic: {code: 'INVALID_DOMAIN'}});
    expect(projectStacked(data, visibility, {...plot, width: 0}, domain, 'sum')).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_PLOT'},
    });
  });

  it('keeps a failed external baseline or value map attached to its own diagnostic path', () => {
    const bands = valid.bands;
    expect(projectColumn(data, visibility, plot, domain, undefined, {bands, mapValue: () => null})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_GEOMETRY', path: 'baseline'},
    });
    expect(projectColumn(data, visibility, plot, domain, undefined, {bands, mapValue: value => value === 0 ? 70 : null})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_GEOMETRY', path: 'series.north.n1'},
    });
    expect(projectColumn(data, visibility, plot, domain, undefined, {bands, mapValue: value => value === 0 ? 70 : Infinity})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_GEOMETRY', path: 'rect'},
    });
    const filtered = projection({firstId: 'b', lastId: 'c'});
    expect(projectColumn(data, visibility, plot, domain, undefined, {bands: filtered.bands, mapValue: value => 70 + value})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'MISSING_CATEGORY_BAND', path: 'viewport.x'},
    });
    expect(pickColumn(valid, valid.rects[0]!.anchor.x, Infinity)).toBeNull();
  });
});
