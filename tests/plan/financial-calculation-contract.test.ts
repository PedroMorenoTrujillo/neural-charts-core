import { expect, it } from 'vitest';
import { groupFinancialOhlc } from '../../src/financial.js';
import type { FinancialGroupingUnit } from '../../src/financial.js';
import { financialIndicators } from '../../src/plan/financial-indicators.js';
import { regression } from '../../src/plan/financial-statistics.js';
import type { PlanFinancialPoint } from '../../src/public/financial-plan-types.js';

const candle = (x: number, o: number, h: number, l: number, c: number, volume?: number | null): PlanFinancialPoint =>
  ({id: 'p:' + x, x, open: o, high: h, low: l, close: c, ...(volume === undefined ? {} : {volume})});
const gap = (x: number): PlanFinancialPoint => ({id: 'p:' + x, x, open: null, high: null, low: null, close: null});

it('restarts ordinal regression at missing data and fits one sample without a spurious slope', () => {
  expect(regression([2, 4, 6, null, 20, 30, 40], 2)).toEqual({
    fit: [null, 4, 6, null, null, 30, 40],
    slope: [null, 2, 2, null, null, 10, 10],
    intercept: [null, 2, 4, null, null, 20, 30],
  });
  expect(regression([2, null, 8], 1)).toEqual({fit: [2, null, 8], slope: [0, null, 0], intercept: [2, null, 8]});
});

it('resets prior-range averages at an absent trading session without reusing its predecessor', () => {
  const data = [candle(0,10,12,8,10), candle(1,10,12,8,10), candle(2,10,12,8,10), gap(3),
    candle(4,10,13,7,10), candle(5,10,13,7,10), candle(6,10,13,7,10)];
  const projected = financialIndicators('atr', data, {period: 3, atrSeed: 'prior-ranges'}).components.atr;
  expect(projected).toEqual([null, null, 4, null, null, null, 6]);
});

it('retains zero volume as measured and resets block volume-weighted price at missing observations', () => {
  const close = [10, 20, 30, 40, 50];
  const volume = [0, 2, 1, null, 3];
  const data = close.map((v, i) => candle(i, v, v, v, v, volume[i]));
  const block = financialIndicators('vwap', data, {window: 'blocks'}).components.vwap!;
  expect(block[0]).toBeNull();
  expect(block[1]).toBe(20);
  expect(block[2]).toBeCloseTo(70 / 3, 12);
  expect(block.slice(3)).toEqual([null, 50]);
  expect(() => financialIndicators('vwap', [candle(0, 10, 11, 9, 10)])).toThrow('VOLUME_REQUIRED');
});

it('registers distinct upward and downward directional movement in the original price scale', () => {
  const data = [candle(0, 10, 11, 9, 10), candle(1, 12, 13, 10, 12), candle(2, 9, 12, 8, 9)];
  const {components} = financialIndicators('dmi', data, {period: 1, directionalIndex: 'dx'});
  expect(components.plus?.[0]).toBeNull();
  expect(components.plus?.[1]).toBeCloseTo(200 / 3, 12);
  expect(components.plus?.[2]).toBe(0);
  expect(components.minus).toEqual([null, 0, 50]);
  expect(components.dx).toEqual([null, 100, 100]);
  expect(() => financialIndicators('candlestick', data)).toThrow('NOT_AN_INDICATOR');
});

it('omits window-close pivots for insufficient sessions or gaps inside the original period', () => {
  const data = [candle(0, 10, 12, 8, 10), gap(1), candle(2, 11, 13, 9, 11), candle(3, 12, 14, 10, 12)];
  const insufficient = financialIndicators('pivotpoints', data.slice(0, 2), {period: 3, pivotPlacement: 'window-close'});
  expect(insufficient.components[insufficient.primary]).toEqual([null, null]);
  const current = financialIndicators('pivotpoints', data, {period: 2, pivotPlacement: 'window-close'});
  const values = current.components[current.primary]!;
  expect(values.slice(0, 3)).toEqual([null, null, null]);
  expect(values[3]).toBeCloseTo((14 + 9 + 12) / 3, 12);
});

it('rejects invalid observations and unrepresentable grouping before returning any bucket', () => {
  const row = candle(0, 2, 4, 1, 3);
  expect(() => groupFinancialOhlc([row], 'quarter' as FinancialGroupingUnit)).toThrow('Unsupported financial grouping unit');
  expect(() => groupFinancialOhlc(Array(100_001), 'day')).toThrow('Financial grouping input limit');
  expect(() => groupFinancialOhlc([candle(-8.64e15, 1, 1, 1, 1)], 'month')).toThrow('Financial bucket outside Date range');
  for (const volume of [-1, Infinity, NaN]) {
    expect(() => groupFinancialOhlc([{...row, volume}], 'day')).toThrow('Invalid financial volume');
  }
  for (const malformed of [{...row, open: null}, {...row, high: null}, {...row, low: null}, {...row, close: null},
    {...row, high: 2}, {...row, low: 2.5}, {...row, open: Infinity}]) {
    expect(() => groupFinancialOhlc([malformed], 'day')).toThrow('Invalid OHLC observation');
  }
  const tooLarge = [candle(0, 2, 4, 1, 3, 1e308), candle(1, 3, 5, 2, 4, 1e308)];
  expect(() => groupFinancialOhlc(tooLarge, 'day')).toThrow('Financial bucket volume overflow');
});

it('groups minute and hour boundaries using UTC and leaves empty periods absent', () => {
  const second = 1_000, minute = 60 * second, hour = 60 * minute;
  const rows = [candle(-second, 2, 4, 1, 3, 0), gap(0), candle(5 * second, 3, 7, 2, 6, null),
    candle(2 * hour + minute, 6, 8, 4, 7, 12)];
  const minutes = groupFinancialOhlc(rows, 'minute');
  expect(minutes.map(row => row.point.x)).toEqual([-minute, 0, 2 * hour + minute]);
  expect(minutes.map(row => row.point.volume)).toEqual([0, null, 12]);
  expect(minutes[1]).toMatchObject({sourceIds: [rows[1]!.id, rows[2]!.id], point: {open: 3, high: 7, low: 2, close: 6, volume: null}});
  expect(groupFinancialOhlc(rows, 'hour').map(row => row.point.x)).toEqual([-hour, 0, 2 * hour]);
});
