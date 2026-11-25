import { describe, expect, it } from 'vitest';
import { planChart } from '../../src/plan.js';
import { planRanges } from '../../src/plan/ranges.js';
import { planStreamgraph } from '../../src/plan/streamgraph.js';
import { planWaterfall } from '../../src/plan/waterfall.js';
import type { PlanColumnSpec, PlanOptions, PlanSpec, PlanWaterfallSpec } from '../../src/plan.js';

const size = { width: 520, height: 320 };
const categories = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const axes = { x: { type: 'category', values: categories }, y: { type: 'linear', nice: false } } as const;
const steps = [{ id: 'first', x: 'a', type: 'delta', value: 10 }, { id: 'second', x: 'b', type: 'delta', value: 30 },
  { id: 'total', x: 'c', type: 'total' }] as const;
const flow = { id: 'flow', name: 'Flow', data: steps };
const waterfall = { family: 'waterfall', title: 'Changes', axes, series: [flow] } as const satisfies PlanSpec;
const samples = [{ id: 'a', x: 'a', y: 10 }, { id: 'b', x: 'b', y: 15 }, { id: 'c', x: 'c', y: 20 }];
const columns = { id: 'actual', name: 'Actual', data: samples };
const column = { family: 'column', title: 'Comparison', axes, series: [columns] } as const satisfies PlanColumnSpec;
const stream = { family: 'streamgraph', title: 'Trend', axes, series: [columns] } as const satisfies PlanSpec;
const highsAndLows = [{ id: 'a', x: 'a', low: 6, high: 9 }, { id: 'b', x: 'b', low: 10, high: 16 }];
const ranges = { family: 'arearange', title: 'Range', axes, series: [{ id: 'estimate', name: 'Estimate', data: highsAndLows }] } as const satisfies PlanSpec;

describe('waterfall ordering and clipped accumulation', () => {
  it.each([
    [{ series: [] }, 'ONE_FLOW_REQUIRED', 'series'],
    [{ series: [{ ...flow, missing: 'as zero' }] }, 'FLOW_LIMIT', 'series'],
    [{ startValue: Infinity }, 'NONFINITE_START', 'startValue'],
    [{ series: [{ ...flow, data: steps.slice(1) }] }, 'ORDERED_COMPLETE_CATEGORIES', 'series.data'],
    [{ series: [{ ...flow, data: [steps[1], steps[0], steps[2]] }] }, 'ORDERED_COMPLETE_CATEGORIES', 'series.data'],
  ] as const)('diagnoses an invalid accumulator input (case %#)', (patch, reason, path) => {
    expect(planWaterfall({ ...waterfall, ...patch } as PlanWaterfallSpec, size)).toMatchObject({ status: 'invalid', diagnostic: { reason, path } });
  });

  it('diagnoses an invalid visibility or viewport before creating partial output', () => {
    expect(planWaterfall(waterfall, { ...size, hiddenSeriesIds: ['unknown'] })).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'UNKNOWN_SERIES', path: 'options.hiddenSeriesIds' },
    });
    expect(planWaterfall(waterfall, { ...size, viewport: { axes: 'y', value: { y: [20, 50] } } })).toMatchObject({
      status: 'invalid', diagnostic: { path: 'viewport.value.y' },
    });
  });

  it('excludes fully clipped bars without changing the original cumulative total', () => {
    const result = planChart(waterfall, { ...size, viewport: { axes: 'y', value: { y: [20, 35] } } });
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.observations.map(point => [point.id.pointId, point.value])).toEqual([['second', 30], ['total', 40]]);
    expect(result.frame.series.flatMap(series => series.bars?.map(bar => bar.pointId) ?? [])).toEqual(['second', 'total']);
    expect(result.frame.viewport?.displayed.y).toEqual([20, 35]);
  });

  it('rejects nonfinite accumulation even when each delta is finite', () => {
    const tooLarge = [{ ...steps[0], value: Number.MAX_VALUE }, { ...steps[1], value: Number.MAX_VALUE }, steps[2]];
    const input: PlanWaterfallSpec = { ...waterfall, series: [{ ...flow, data: tooLarge }] };
    expect(planChart(input, size)).toMatchObject({ status: 'invalid', diagnostic: { reason: 'FLOW_OVERFLOW', path: 'series.data' } });
  });
});

describe('range input constraints and original units', () => {
  it.each([
    [{ barGap: 0.25 }, {}, 'COLUMN_RANGE_LAYOUT_ONLY', 'spec'],
    [{}, { stacking: 'sum' }, 'UNSUPPORTED_STACKING', 'options.stacking'],
    [{}, { hiddenSeriesIds: ['estimate', 'estimate'] }, 'BAD_VISIBILITY', 'options.hiddenSeriesIds'],
    [{ series: [ranges.series[0], ranges.series[0]] }, {}, 'DUPLICATE_SERIES_ID', 'series[1].id'],
    [{ series: [{ ...ranges.series[0], data: [{ ...highsAndLows[0], x: {} }] }] }, {}, 'BAD_SPEC', 'series[0].data[0].x'],
  ] as const)('rejects range options at the source field (case %#)', (patch, options, reason, path) => {
    expect(planRanges({ ...ranges, ...patch } as Parameters<typeof planRanges>[0], { ...size, ...options })).toMatchObject({
      status: 'invalid', diagnostic: { reason, path },
    });
  });

  it('applies a global cap across range series', () => {
    const data = Array.from({ length: 5_001 }, (_, i) => ({ id: 'p' + i, x: i, low: 0, high: 1 }));
    const result = planChart({ ...ranges, axes: { ...axes, x: { type: 'linear' } }, series: [
      { id: 'first', name: 'First', data }, { id: 'second', name: 'Second', data },
    ] }, size);
    expect(result).toMatchObject({ status: 'invalid', diagnostic: { reason: 'RESOURCE_LIMIT', path: 'series.data' } });
  });

  it('projects both endpoints in resized UTC and Y windows without changing their measured values', () => {
    const origin = Date.UTC(2026, 0, 1), day = 86_400_000;
    const data = [0, 1, 2, 3].map(index => ({ id: 'p' + index, x: origin + index * day, low: 5 + index, high: 11 + index }));
    const spec = { ...ranges, family: 'areasplinerange', axes: { x: { type: 'time' }, y: { type: 'linear' } },
      series: [{ ...ranges.series[0], data }] } as const;
    const window = { x: [origin + day, origin + 3 * day], y: [6, 14] } as const;
    const result = planChart(spec, { ...size, viewport: { axes: 'xy', value: window } });
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.viewport?.displayed).toEqual(window);
    expect(result.frame.observations.map(point => [point.id.pointId, point.lowValue, point.highValue])).toEqual([
      ['p1', 6, 12], ['p2', 7, 13], ['p3', 8, 14],
    ]);
    expect(result.frame.series[0]?.areaCommands?.some(command => command.type === 'Z')).toBe(true);
  });
});

describe('fixed stream and grouped column layouts', () => {
  it('keeps a streamgraph diagnostic specific to the option or category limit that failed', () => {
    expect(planStreamgraph(stream, { ...size, stacking: 'sum' })).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'STREAMGRAPH_HAS_FIXED_STACK', path: 'options.stacking' },
    });
    expect(planStreamgraph(stream, { ...size, hiddenSeriesIds: ['actual', 'actual'] })).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'BAD_VISIBILITY', path: 'options.hiddenSeriesIds' },
    });
    const values = [...categories, ...Array.from({ length: 62 }, (_, i) => ({ id: 'unused-' + i }))];
    const crowded = { ...stream, axes: { ...axes, x: { ...axes.x, values } } };
    expect(planStreamgraph(crowded, size)).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'LABEL_LIMIT', path: 'axes.x.values' },
    });
  });

  it('keeps an independent group in a scoped Y viewport and empties it when all series are hidden', () => {
    const options = { ...size, stacking: 'sum', stackGroups: [{ id: 'group', label: 'Single group', seriesIds: ['actual'] }] } as const satisfies PlanOptions;
    const plot = planChart(column, { ...options, viewport: { axes: 'y', value: { y: [4, 17] } } });
    if (plot.status !== 'ok') throw Error(JSON.stringify(plot));
    expect(plot.frame.viewport?.displayed.y).toEqual([4, 17]);
    expect(plot.frame.observations[0]).toMatchObject({ id: { seriesId: 'actual', pointId: 'a' }, value: 10 });
    expect(planChart(column, { ...options, hiddenSeriesIds: ['actual'] })).toMatchObject({
      status: 'empty', frame: { observations: [], legend: [expect.objectContaining({ id: 'actual', visible: false })] },
    });
  });
});
