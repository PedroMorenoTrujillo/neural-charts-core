import { describe, expect, it } from 'vitest';
import { scatterState, validateScatter, validateScatterOptions } from '../../src/scatter/validate.js';
import { seriesIdentities } from '../../src/internal/interaction/identities.js';

const point = { id: 'zero', x: 0, y: 0 };
const series = { id: 'demand', name: 'Demanda', data: [point] };
const axis = { type: 'linear', domain: [-20, 20], nice: false };
const chart = { family: 'scatter', title: 'Demanda', axes: { x: axis, y: axis }, series: [series] };

describe('scatter option and data snapshot', () => {
  it('owns validated display, selection and highlight options and preserves zero-value observations', () => {
    const datum = { label: 'Original measurement' };
    const input = {
      ...chart, description: '', theme: 'dark', direction: 'rtl', labels: 'off',
      font: { family: 'monospace', size: 15, weight: 600 }, legend: { position: 'end' },
      tooltip: { mode: 'point', placement: 'start' },
      axes: { x: { ...axis, domain: [...axis.domain], title: 'Tiempo', reversed: true, grid: false, ticks: { targetCount: 4 }, labels: { maxWidth: 40 } },
        y: { type: 'linear', includeZero: true, nice: true } },
      series: [{ ...series, color: '#1a6ac2', marker: { shape: 'diamond', size: 10 }, data: [
        { ...point, datum }, { id: 'missing-x', x: null, y: 8 }, { id: 'missing-y', x: 12, y: null },
      ] }],
      state: { mode: 'controlled', value: { hiddenSeriesIds: ['demand'] } },
      status: { type: 'loading', message: 'En curso' }, motion: 'subtle',
      references: [{ id: 'limit', axis: 'y', value: 0, label: 'Cero', color: '#123456', dash: 'dotted' }],
      referenceBands: [{ id: 'allowed', axis: 'x', from: -5, to: 3, label: 'Permitido' }],
      selection: { mode: 'internal', type: 'multiple', initial: [{ seriesId: 'demand', pointId: 'zero' }] }, crosshair: 'xy',
      viewport: { mode: 'internal', axes: 'x', initial: { x: [-5, 5] } },
    };
    const result = validateScatter(input);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw Error(result.diagnostic.message);
    const owned = result.value;
    expect(owned).not.toBe(input);
    expect(owned.series).not.toBe(input.series);
    expect(owned.series[0]?.data.map(p => [p.id, p.x, p.y])).toEqual([
      ['zero', 0, 0], ['missing-x', null, 8], ['missing-y', 12, null],
    ]);
    expect(owned.series[0]?.data[0]?.datum).toBe(datum);
    expect([...seriesIdentities(owned).values()]).toEqual([{ seriesId: 'demand', pointId: 'zero' }]);
    expect(owned.axes.x).toMatchObject({ reversed: true, grid: false, ticks: { targetCount: 4 }, labels: { maxWidth: 40 } });
    expect(owned.references).toMatchObject(input.references);
    expect(owned.referenceBands).toMatchObject(input.referenceBands);
    expect(owned.state).toEqual(input.state);
    expect(Object.isFrozen(owned.series[0]?.data[0])).toBe(true);
    expect(Object.isFrozen(owned.font)).toBe(true);
    input.axes.x.domain[0] = -999;
    expect(owned.axes.x.domain).toEqual([-20, 20]);
  });

  it.each([
    { status: { type: 'ready' }, state: { mode: 'internal' }, crosshair: false },
    { status: { type: 'error', message: 'Origen no disponible' } },
    { status: { type: 'empty' } },
  ])('accepts an independent presentation state %j', options => {
    expect(validateScatter({ ...chart, ...options })).toMatchObject({ status: 'ok', value: options });
  });

  it.each([
    ['nonboolean axis reversal', { axes: { ...chart.axes, x: { ...axis, reversed: 1 } } }, 'axes.x.reversed'],
    ['degenerate domain', { axes: { ...chart.axes, x: { ...axis, domain: [1, 1] } } }, 'axes.x.domain'],
    ['missing upper bound', { axes: { ...chart.axes, x: { ...axis, domain: [1] } } }, 'axes.x.domain'],
    ['expand explicit bounds', { axes: { ...chart.axes, x: { ...axis, nice: true } } }, 'axes.x.nice'],
    ['fractional number of tick labels', { axes: { ...chart.axes, x: { ...axis, ticks: { targetCount: 4.5 } } } }, 'axes.x.ticks.targetCount'],
    ['duplicate series', { series: [series, series] }, 'series[1].id'],
    ['duplicate observation', { series: [{ ...series, data: [point, point] }] }, 'series[0].data[1].id'],
    ['non-finite observation', { series: [{ ...series, data: [{ ...point, y: NaN }] }] }, 'series[0].data[0].y'],
    ['unsupported status message', { status: { type: 'ready', message: 'Ready' } }, 'spec.status'],
    ['missing error message', { status: { type: 'error' } }, 'spec.status.message'],
    ['owned state with initial value', { state: { mode: 'internal', value: { hiddenSeriesIds: ['demand'] } } }, 'spec.state'],
    ['unknown hidden series', { state: { mode: 'controlled', value: { hiddenSeriesIds: ['other'] } } }, 'spec.state.value'],
    ['duplicate hidden series', { state: { mode: 'controlled', value: { hiddenSeriesIds: ['demand', 'demand'] } } }, 'spec.state.value'],
    ['duplicate reference line', { references: [{ id: 'zero', axis: 'x', value: 0 }, { id: 'zero', axis: 'y', value: 0 }] }, 'spec.references[1].id'],
  ] as const)('rejects %s at its source path', (_description, fields, path) => {
    expect(validateScatter({ ...chart, ...fields })).toMatchObject({ status: 'invalid', diagnostic: { path } });
  });

  it('mount options accept only valid IDs, functions and known hidden series', () => {
    const ids = new Set(['demand']);
    const state = { hiddenSeriesIds: ['demand'] };
    const onPointActivate = () => undefined;
    expect(validateScatterOptions({ instanceId: 'test-chart_1', initialState: state, onPointActivate }, ids))
      .toMatchObject({ status: 'ok', value: { instanceId: 'test-chart_1', initialState: state, onPointActivate } });
    expect(scatterState(state, ids)).not.toBe(state);
    expect(validateScatterOptions({ instanceId: '17 invalid' }, ids)).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'BAD_INSTANCE_ID', path: 'options.instanceId' },
    });
    expect(validateScatterOptions({ instanceId: 'test-chart', onPointActivate: 'yes' }, ids)).toMatchObject({
      status: 'invalid', diagnostic: { path: 'options.onPointActivate' },
    });
  });
});
