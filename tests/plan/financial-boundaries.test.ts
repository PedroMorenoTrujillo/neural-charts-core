import { describe, expect, it } from 'vitest';
import { planFinancialChart } from '../../src/plan/financial.js';
import { rangeZigzag, twoSessionSar } from '../../src/plan/financial-reversals.js';
import { extrema, meanAbsoluteDeviation, movingAverage, regression, rollingDeviation, weightedAverage } from '../../src/plan/financial-statistics.js';
import type { PlanFinancialSpec } from '../../src/public/financial-plan-types.js';
import type { PlanOptions } from '../../src/public/plan-types.js';

const points = Array.from({ length: 24 }, (_, x) => ({
  id: 'session-' + x, x, open: x + 10, high: x + 14, low: x + 8, close: x + 12, volume: 5 + x,
}));
const missing = { open: null, high: null, low: null, close: null };
const series = { id: 'market', name: 'Mercado', data: points };
const axes = { x: { type: 'linear' }, y: { type: 'linear' } };
const baseline = { family: 'ohlc', title: 'Cotizaciones', axes, series: [series] };
const dimensions = { width: 560, height: 320 };
const plan = (input: unknown, options: unknown = dimensions) => planFinancialChart(input as PlanFinancialSpec, options as PlanOptions);

describe('reversal indicators preserve gaps and original price extrema', () => {
  it('records both directions at the original session and restarts after each missing range', () => {
    const prices = [100, 85, 70, 72, 80, 100, null, 20, 18, 21];
    expect(rangeZigzag(prices, prices, 10)).toEqual([100, null, 70, null, null, 100, null, 20, 18, 21]);
    const belowThreshold = [100, 99, 102, 104];
    expect(rangeZigzag(belowThreshold, belowThreshold, 10)).toEqual([null, null, null, null]);
  });

  it('does not carry acceleration or reversal direction across missing price sessions', () => {
    const high = [9, 10, 11, 12, 2, 1, 0, 1, 20, 21];
    const low = [8, 9, 10, 11, 1, 0, -1, 0, 19, 20];
    const run = twoSessionSar(high, low);
    expect(run.slice(0, 4)).toEqual([null, null, 8, 8.04]);
    expect(run[5]).toBeGreaterThan(high[5]!);
    expect(run[9]).toBeLessThan(high[9]!);
    expect(twoSessionSar([...high, null, ...high], [...low, 0, ...low])).toEqual([...run, null, ...run]);
  });
});

describe('financial display variants retain original observation metadata', () => {
  const scalarPrices = (close: readonly (number | null)[]) => close.map((price, x) => ({
    id: 'p' + x, x, open: price, high: price, low: price, close: price,
  }));

  it('pads odd UTC candle intervals to integral timestamps and preserves the source close', () => {
    const start = Date.UTC(2026, 0, 1);
    const data = scalarPrices([12, 15]).map((point, i) => ({...point, x: start + i * 3}));
    const result = plan({...baseline, family: 'candlestick', axes: {...axes, x: {type: 'time'}}, series: [{...series, data}]},
      {...dimensions, viewport: {axes: 'x'}});
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.viewport?.bounds.x).toMatchObject({type:'time',domain:[start-2,start+5]});
    expect(result.frame.observations.map(point => [point.xValue, point.financial?.close])).toEqual([[start, 12], [start + 3, 15]]);
  });

  it('protects derived ordinal charts when box size or count cannot be represented', () => {
    const run = (family: string, prices: readonly (number | null)[], options: unknown = dimensions, parameters?: unknown) =>
      plan({...baseline, family, ...(parameters === undefined ? {} : {parameters}), series: [{...series, data: scalarPrices(prices)}]}, options);
    expect(run('renko', [-1.5e308, 1.5e308])).toMatchObject({status: 'invalid', diagnostic: {reason: 'BAD_BOX_SIZE'}});
    expect(run('renko', [1e20, 1e20 + 1e6], dimensions, {boxSize: 1})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_FINANCIAL_VALUE'},
    });
    expect(run('pointandfigure', [1, 5000], {...dimensions, capacity: {points: 1000}}, {boxSize: 1})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'DERIVED_POINT_LIMIT'},
    });
    expect(run('pointandfigure', [1e20, 1e20 + 1e6], dimensions, {boxSize: 1})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_FINANCIAL_VALUE'},
    });
  });

  it('returns a calculation diagnostic before drawing a nonrepresentable average', () => {
    const data = scalarPrices([1.5e308, -1.5e308]);
    expect(plan({...baseline, family: 'sma', parameters: {period: 2}, series: [{...series, data}]})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE_FINANCIAL_VALUE'},
    });
  });

  it('retains source prices, reading direction and description when grouped padding would overflow', () => {
    const data = scalarPrices([12, 16]).map((point, i) => ({...point, x: i ? 1.5e308 : -1.5e308}));
    const input = {...baseline, family: 'candlestick', description: 'Observed prices', axes: {...axes,
      y: {type: 'linear', domain: [0,20], nice: false, reversed: true}}, series: [{...series,data}]};
    const result = plan(input);
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.description).toBe('Observed prices');
    expect(result.frame.viewport?.bounds.x).toMatchObject({type:'linear',domain:[-1.5e308,1.5e308]});
    expect(result.frame.viewport?.reversed.y).toBe(true);
    expect(result.frame.observations.map(o=>o.value)).toEqual([12,16]);
    expect(result.frame.observations[0]!.y).toBeLessThan(result.frame.observations[1]!.y);
    expect(plan(input,{...dimensions,viewport:{axes:'y',value:{y:[17,20]}}})).toMatchObject({
      status:'empty',frame:{observations:[]},
    });
  });

  it('keeps positions exact for one-session Ichimoku windows and zero completed-session displacement', () => {
    const input={...baseline,family:'ikh',parameters:{period:1,shortPeriod:1,longPeriod:1}};
    const one=plan({...input,series:[{...series,data:scalarPrices([12])}]});
    if(one.status!=='ok')throw Error(JSON.stringify(one));
    const value=one.frame.observations[0]!;
    expect(value).toMatchObject({id:{pointId:'p0'},value:12,financial:{components:{conversion:12,base:12}}});
    const parts=one.frame.series[0]?.parts;
    const lagging=parts?.find(part=>part.key==='lagging')?.commands?.[0];
    const leading=parts?.find(part=>part.key==='spanA')?.commands?.[0];
    expect(lagging).toMatchObject({type:'M',y:value.y});
    expect(leading).toMatchObject({type:'M',y:value.y});
    expect(lagging && 'x' in lagging && lagging.x).toBeLessThan(value.x);
    expect(leading && 'x' in leading && leading.x).toBeGreaterThan(value.x);

    const completed=plan({...input,parameters:{...input.parameters,cloudAlignment:'completed-session'},series:[{...series,data:scalarPrices([12,14,16])}]});
    if(completed.status!=='ok')throw Error(JSON.stringify(completed));
    expect(completed.frame.observations.map(o=>[o.id.pointId,o.value,o.financial?.components?.spanA])).toEqual([
      ['p0',12,12],['p1',14,14],
    ]);
  });


  it('keeps derived point-and-figure symbols tied to their input price across a direction change and a gap', () => {
    const data = scalarPrices([10, 12, 14, 10, 8, null, 11, 13]);
    const projected = plan({...baseline, family: 'pointandfigure', parameters: {boxSize: 1, reversal: 2},
      series: [{...series, data}]});
    if (projected.status !== 'ok') throw Error(JSON.stringify(projected));
    expect(projected.frame.financial?.layout).toBe('ordinal');
    expect(projected.frame.observations.map(point => [point.financial?.originalId, point.financial?.close])).toEqual([
      ['p1', 12], ['p3', 10], ['p6', 11],
    ]);
    const marks = projected.frame.series[0]!.commands!;
    expect(marks.some(command => command.type === 'A')).toBe(true);
    expect(marks.some(command => command.type === 'L')).toBe(true);
    expect(projected.frame.observations.some(point => point.financial?.originalId === 'p5')).toBe(false);
  });

  it('honors the configured derived point budget during a renko expansion', () => {
    const data = scalarPrices([10, 11_000]);
    const result = plan({...baseline, family: 'renko', parameters: {boxSize: 0.5}, series: [{...series, data}]},
      {...dimensions, capacity: {points: 1000}});
    expect(result).toMatchObject({status: 'invalid', diagnostic: {reason: 'DERIVED_POINT_LIMIT'}});
    expect(plan({...baseline, family: 'renko', parameters: {boxSize: 1}, series: [
      {...series, data: scalarPrices([1, 3, null, 5])},
    ]})).toMatchObject({status: 'ok', frame: {financial: {layout: 'ordinal'}}});
    expect(plan({...baseline, family: 'renko', series: [{...series, data: scalarPrices([null, null])}]})).toMatchObject({
      status: 'empty', frame: {observations: []},
    });
  });

  it('represents both a named price flag and an untitled flag without losing its UTC session', () => {
    const day = 86_400_000, origin = Date.UTC(2026, 0, 1);
    const data = scalarPrices([12, 14, null]).map((point, index) => ({
      ...point, x: origin + index * day, ...(index === 0 ? {title: 'Earnings update'} : {}),
    }));
    const result = plan({...baseline, family: 'flags', axes: {...axes, x: {type: 'time'}}, series: [{...series, data}]});
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.observations.map(point => [point.id.pointId, point.label, point.value])).toEqual([
      ['p0', 'Earnings update', 12], ['p1', '2026-01-02T00:00:00.000Z', 14],
    ]);
    expect(result.frame.annotations?.map(item => item.text)).toEqual(['Earnings update', '•']);
    expect(result.frame.series[0]?.bars?.map(bar => bar.width)).toEqual([64, 20]);
  });

  it.each([
    [{axes: 'x', value: {x: [1, 2]}}, ['first', 'last']],
    [{axes: 'y', value: {y: [15, 25]}}, ['before', 'after']],
  ] as const)('removes viewport-excluded flags from both geometry and annotations (case %#)', (viewport, expectedIds) => {
    const data = [
      {id: 'before', x: .99, y: 20, title: 'Outside left'},
      {id: 'first', x: 1, y: 10, title: 'First visible'},
      {id: 'last', x: 2, y: 30, title: 'Last visible'},
      {id: 'after', x: 2.01, y: 20, title: 'Outside right'},
    ].map(({y, ...row}) => ({...row, open: y, high: y, low: y, close: y}));
    const core = plan({...baseline, family: 'flags', series: [{...series, data}]},
      {width: 480, height: 320, viewport});
    if (core.status !== 'ok') throw Error(JSON.stringify(core));
    const { observations, annotations } = core.frame;
    expect(observations.map(point => point.id.pointId)).toEqual(expectedIds);
    expect(annotations).toEqual(observations.map(point => ({
      x: point.x + 10, y: point.y - 26, text: point.label, role: 'label',
    })));
    expect(core.frame.series[0]?.bars?.map(bar => bar.pointId)).toEqual(expectedIds);
    expect(core.frame.series[0]?.commands?.map(command => command.type)).toEqual(['M', 'L', 'M', 'L']);
  });

  it('conserves measured volume for a flat price and skips a null volume', () => {
    const data = scalarPrices([100, 100, 100]).map((row, index) => ({...row, volume: [5, null, 7][index]}));
    const original = {...baseline, family: 'vbp', title: 'Flat session', description: 'Volume in price bins',
      parameters: {period: 4}, series: [{...series, color: '#aabbcc', data}]};
    const result = plan(original);
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.financial?.layout).toBe('volume-profile');
    expect(result.frame.description).toBe('Volume in price bins');
    expect(result.frame.observations.map(row => row.value)).toEqual([0, 0, 12, 0]);
    expect(plan(original, {...dimensions, viewport: {axes: 'x', value: {x: [0, 1]}}})).toMatchObject({
      status: 'invalid', diagnostic: {path: 'viewport.value.x'},
    });
  });

  it('steps window-close pivots only between the original closing sessions', () => {
    const data = points.slice(0, 8);
    const result = plan({...baseline, family: 'pivotpoints', parameters: {period: 2, pivotPlacement: 'window-close'},
      series: [{...series, data}]});
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    const primary = result.frame.series[0]!.parts!.find(part => part.key === 'pivot')!.commands!;
    expect(result.frame.series[0]?.circles?.map(circle => circle.pointId)).toEqual(['session-2','session-4','session-6','session-7']);
    expect(primary.map(mark => mark.type)).toEqual(['M','L','L','L','L','L','L']);
    for (let i = 1; i < primary.length; i += 2) {
      expect(primary[i]).toMatchObject({y: (primary[i - 1] as {y: number}).y});
      expect(primary[i + 1]).toMatchObject({x: (primary[i] as {x: number}).x});
    }
    const first = result.frame.observations[0]!;
    expect(first.id.pointId).toBe('session-2');
    expect(first.value).toBeCloseTo((16 + 8 + 14) / 3, 12);
  });
});

describe('financial planner authority and option boundaries', () => {
  it.each([
    ['vwap', { window: 'unknown' }, 'BAD_VWAP_WINDOW'],
    ['dpo', { alignment: 'unknown' }, 'BAD_DPO_ALIGNMENT'],
    ['trendline', { regressionBasis: 'unknown' }, 'BAD_TRENDLINE_BASIS'],
    ['klinger', { forceStart: 'unknown' }, 'BAD_KLINGER_FORCE_START'],
    ['klinger', { signalAverage: 'unknown' }, 'BAD_KLINGER_SIGNAL_AVERAGE'],
    ['atr', { atrSeed: 'unknown' }, 'BAD_ATR_SEED'],
    ['chaikin', { warmup: 0.5 }, 'BAD_CHAIKIN_WARMUP'],
    ['chaikin', { warmup: -1 }, 'BAD_CHAIKIN_WARMUP'],
    ['chaikin', { warmup: 4097 }, 'BAD_CHAIKIN_WARMUP'],
    ['dmi', { directionalIndex: 'minus' }, 'BAD_DIRECTIONAL_INDEX'],
    ['ikh', { cloudAlignment: 'unknown' }, 'BAD_CLOUD_ALIGNMENT'],
    ['pivotpoints', { pivotPlacement: 'unknown' }, 'BAD_PIVOT_PLACEMENT'],
    ['zigzag', { swingSource: 'unknown' }, 'BAD_SWING_SOURCE'],
    ['psar', { sarInitialization: 'unknown' }, 'BAD_SAR_INITIALIZATION'],
    ['sma', { index: 'mid' }, 'BAD_FINANCIAL_INDEX'],
    ['sma', { period: 0 }, 'BAD_FINANCIAL_PERIOD'],
    ['sma', { period: 4097 }, 'BAD_FINANCIAL_PERIOD'],
    ['sma', { period: 2.5 }, 'BAD_FINANCIAL_PERIOD'],
    ['renko', { boxSize: 0 }, 'BAD_FINANCIAL_PARAMETER'],
    ['renko', { boxSize: -1 }, 'BAD_FINANCIAL_PARAMETER'],
    ['trendline', { xUnit: 0 }, 'BAD_FINANCIAL_PARAMETER'],
    ['ohlc', { period: 1 }, 'UNSUPPORTED_FINANCIAL_PARAMETER'],
    ['vbp', { period: 257 }, 'VOLUME_PROFILE_BIN_LIMIT'],
  ] as const)('rejects an unsupported %s parameter specifically', (family, parameters, reason) => {
    expect(plan({ ...baseline, family, parameters })).toMatchObject({ status: 'invalid', diagnostic: { reason } });
    expect(plan(baseline).status).toBe('ok');
  });

  it.each([
    [{ family: 'scatter' }, 'BAD_FINANCIAL_SPEC'],
    [{ title: 1 }, 'BAD_FINANCIAL_SPEC'],
    [{ axes: null }, 'BAD_FINANCIAL_SPEC'],
    [{ axes: { x: { type: 'category' }, y: axes.y } }, 'BAD_FINANCIAL_SPEC'],
    [{ axes: { x: axes.x, y: { type: 'time' } } }, 'BAD_FINANCIAL_SPEC'],
    [{ color: '#fff' }, 'BAD_FINANCIAL_SPEC'],
    [{ series: {} }, 'BAD_FINANCIAL_SPEC'],
    [{ series: [{ ...series, id: '' }] }, 'BAD_FINANCIAL_SERIES'],
    [{ series: [{ ...series, name: 1 }] }, 'BAD_FINANCIAL_SERIES'],
    [{ series: [series, series] }, 'BAD_FINANCIAL_SERIES'],
    [{ series: [{ ...series, data: {} }] }, 'BAD_FINANCIAL_SERIES'],
    [{ series: [{ ...series, customOption: false }] }, 'BAD_FINANCIAL_SERIES'],
    [{ series: [{ ...series, data: [points[0], { ...points[1], id: 'session-0' }] }] }, 'BAD_FINANCIAL_POINT'],
    [{ series: [{ ...series, data: [points[0], { ...points[1], x: 0 }] }] }, 'BAD_FINANCIAL_POINT'],
    [{ series: [{ ...series, data: [{ ...points[0], x: '1' }] }] }, 'BAD_FINANCIAL_POINT'],
    [{ series: [{ ...series, data: [{ ...points[0], high: null }] }] }, 'BAD_OHLC'],
    [{ series: [{ ...series, data: [{ ...points[0], open: 100 }] }] }, 'BAD_OHLC_RANGE'],
    [{ series: [{ ...series, data: [{ ...points[0], volume: -1 }] }] }, 'BAD_VOLUME'],
    [{ axes: { ...axes, x: { type: 'time' } }, series: [{ ...series, data: [{ ...points[0], x: 1.5 }] }] }, 'OUTSIDE_DATE_RANGE'],
  ] as const)('rejects a malformed price source at the calculation boundary', (patch, reason) => {
    expect(plan({ ...baseline, ...patch })).toMatchObject({ status: 'invalid', diagnostic: { reason } });
  });

  it('honors empty prices, zero volumes, unknown visibility and the requested plan capacity', () => {
    const empty = { ...baseline, series: [{ ...series, data: points.map(point => ({ ...point, ...missing })) }] };
    expect(plan(empty).status).toBe('empty');
    expect(plan({ ...empty, family: 'renko' }).status).toBe('empty');
    expect(plan({ ...empty, family: 'pointandfigure' }).status).toBe('empty');
    expect(plan({ ...baseline, family: 'vbp', series: [{ ...series, data: points.map(({ volume: _volume, ...point }) => point) }] }))
      .toMatchObject({ status: 'invalid', diagnostic: { reason: 'VOLUME_REQUIRED' } });
    expect(plan(baseline, { ...dimensions, hiddenSeriesIds: ['invented'] }))
      .toMatchObject({ status: 'invalid', diagnostic: { reason: 'UNKNOWN_SERIES' } });
    expect(plan(baseline, { ...dimensions, capacity: { points: 2 } }))
      .toMatchObject({ status: 'invalid', diagnostic: { reason: 'INPUT_LIMIT' } });
    expect(plan(baseline, { ...dimensions, stacking: 'sum' }))
      .toMatchObject({ status: 'invalid', diagnostic: { reason: 'UNSUPPORTED_FINANCIAL_OPTION' } });
  });
});

describe('financial window arithmetic', () => {
  const observations = [1, 2, 3, 4, null, -2, -1, 0, 1];
  it('resets rolling state at missing prices and preserves actual zeros', () => {
    expect(movingAverage(observations, 3)).toEqual([null, null, 2, 3, null, null, null, -1, 0]);
    expect(movingAverage(observations, 3, 'exponential')).toEqual([null, null, 2, 3, null, null, null, -1, 0]);
    const wilder = movingAverage(observations, 3, 'wilder');
    expect(wilder[3]).toBeCloseTo(8 / 3);
    expect(wilder[4]).toBeNull();
    expect(wilder[8]).toBeCloseTo(-1 / 3);
    expect(weightedAverage(observations, 3)[3]).toBeCloseTo(20 / 6);
    expect(weightedAverage(observations, 3)[7]).toBeCloseTo(-2 / 3);
    expect(rollingDeviation(observations, 1)).toEqual(observations.map(x => x === null ? null : 0));
    expect(rollingDeviation(observations, 3)).toEqual([null, null, 1, 1, null, null, null, 1, 1]);
    const mean = meanAbsoluteDeviation(observations, 3);
    for (const index of [2, 3, 7, 8]) expect(mean[index]).toBeCloseTo(2 / 3);
    expect(mean[4]).toBeNull();
  });

  it('matches each finite-window extreme with a latest-tie reference after cache compaction', () => {
    for (const maximum of [false, true]) {
      const ascending = Array.from({ length: 2048 }, (_, i) => maximum ? 100_000 - i : i);
      const values = [...ascending, null, 1, 1, 1, 1];
      const { values: extremes, indices } = extrema(values, 3, maximum);
      for (let i = 2; i < ascending.length; i++) {
        expect(indices[i]).toBe(i - 2);
        expect(extremes[i]).toBe(ascending[i - 2]);
      }
      expect(indices.at(-1)).toBe(values.length - 1);
      expect(extremes.at(-1)).toBe(1);
      expect(extremes[ascending.length]).toBeNull();
    }
  });

  it('uses original elapsed coordinates and explicitly handles zero variance', () => {
    const coordinates = [0, 2, 5, 9, 11, 12, 20];
    const values = coordinates.map((x, i) => i === 3 ? null : 2 * x + 3);
    const line = regression(values, 2, coordinates);
    expect(line.fit).toEqual([null, 7, 13, null, null, 27, 43]);
    expect(line.slope).toEqual([null, 2, 2, null, null, 2, 2]);
    expect(regression([6, 10, 20], 2, [12, 12, 12]).slope).toEqual([null, 0, 0]);
    expect(regression([8, null, -1], 1).fit).toEqual([8, null, -1]);
  });
});
