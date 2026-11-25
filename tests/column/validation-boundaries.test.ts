import { describe, expect, it, vi } from 'vitest';
import { validateColumn, validateColumnOptions, validateColumnState } from '../../src/column/validate.js';
import { normalizeColumn } from '../../src/column/normalize.js';
import { columnDockBody, navigateColumn, projectColumn, reconcileColumn } from '../../src/column/geometry.js';
import { columnFocusScene } from '../../src/column/scene.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { emptyLayers } from '../../src/internal/axes/scene.js';

const x = { type: 'category', values: [{ id: 'actual' }, { id: 'forecast' }] };
const y = { type: 'linear' };
const axes = { x, y };
const data = [{ id: 'closed', x: 'actual', y: 8 }, { id: 'unposted', x: 'forecast', y: null }];
const series = [{ id: 'revenue', name: 'Revenue', data }];
const chart = { family: 'column', title: 'Quarter', axes, series };
const ids = new Set(['revenue']);

describe('column input adapter boundaries', () => {
  it('docks a horizontal tooltip on the free physical side in both reading directions', () => {
    const plot = {x: 10, y: 20, width: 390, height: 160};
    const left = {x: 20, y: 30, width: 40, height: 8};
    const right = {x: 340, y: 30, width: 38, height: 8};
    const tooWide = {...left, width: 350};
    for (const direction of ['ltr', 'rtl'] as const) {
      expect(columnDockBody(plot, left, true, direction)).toEqual({x: 256, y: 20, width: 144, height: 160});
      expect(columnDockBody(plot, right, true, direction)).toEqual({x: 10, y: 20, width: 144, height: 160});
      expect(columnDockBody(plot, tooWide, true, direction)).toBe(plot);
      expect(columnDockBody(plot, left, false, direction)).toBe(plot);
    }
  });

  it('reconciles focus by original identity after category removal and returns no stale keyboard targets', () => {
    const categories = ['actual','forecast','combined'].map(id => ({id}));
    const original = validateColumn({...chart, axes: {...axes, x: {...x, values: categories}},
      series: [{...series[0], data: categories.map(({id}, i) => ({id, x: id, y: i + 1}))}]});
    const revised = validateColumn({...chart, axes: {...axes, x: {...x, values: categories.filter(c => c.id !== 'forecast')}},
      series: [{...series[0], data: [{id:'actual', x:'actual',y:1}, {id:'combined',x:'combined',y:3}]}]});
    if (original.status==='invalid' || revised.status==='invalid') throw Error('Expected validated columns');
    const plot = {x: 10, y: 20, width: 100, height: 120};
    const state = {hiddenSeriesIds: []};
    const before = projectColumn(normalizeColumn(original.value), state, plot, [0,10]);
    const after = projectColumn(normalizeColumn(revised.value), state, plot, [0,10]);
    const hidden = projectColumn(normalizeColumn(revised.value), {hiddenSeriesIds:['revenue']}, plot, [0,10]);
    if (before.status==='invalid' || after.status==='invalid' || hidden.status==='invalid') throw Error('Expected projected columns');
    const old = before.value.rects.find(rect=>rect.point.id==='forecast')!;
    const reconciled = reconcileColumn(after.value, old);
    expect(reconciled?.point.id).toBe('combined');
    expect(navigateColumn(after.value, reconciled, 'ArrowRight')).toBe(reconciled);
    expect(reconcileColumn(hidden.value, old)).toBeNull();
    expect(navigateColumn(hidden.value, null, 'Home')).toBeNull();
  });

  it('paints a visible keyboard focus ring for subpixel-width source columns', () => {
    const measured = validateColumn({...chart, maxBarWidth: 0.5});
    if (measured.status === 'invalid') throw Error(JSON.stringify(measured.diagnostic));
    const projected = projectColumn(normalizeColumn(measured.value), {hiddenSeriesIds: []},
      {x: 10, y: 20, width: 100, height: 120}, [0, 10]);
    if (projected.status === 'invalid') throw Error(JSON.stringify(projected.diagnostic));
    const [rect] = projected.value.rects;
    expect(rect?.point.id).toBe('closed');
    expect(rect?.width).toBe(0.5);
    const palette = defaultPalette('dark', false), layers = emptyLayers();
    columnFocusScene(rect!, palette, layers);
    expect(layers.interaction).toMatchObject([{type: 'rect', key: 'focus', clipKey: 'plot',
      x: rect!.x, y: rect!.y, width: 2, height: rect!.height,
      presentation: {stroke: {type: 'solid', value: palette.focus}, strokeWidth: 2}}]);
  });
  it('owns signed numeric, direction, axis and appearance options', () => {
    const appearance = {
      orientation: 'horizontal', theme: 'dark', direction: 'rtl', description: 'Revenue by period',
      groupGap: 0.95, barGap: 1, maxBarWidth: 0.25, font: { family: 'monospace', size: 32, weight: 700 },
      legend: { position: 'none' }, tooltip: { mode: 'shared', placement: 'start' },
      crosshair: 'xy', motion: 'subtle', labels: 'off',
    };
    const namedAxes = {
      x: { ...x, values: [{ id: 'actual', label: 'Actual' }, { id: 'forecast' }], title: 'Period', grid: false, labels: { maxWidth: 16 } },
      y: { ...y, domain: [-0, 15], reversed: true, nice: false, ticks: { targetCount: 12 } },
    };
    const references = [{ id: 'target', axis: 'y', value: 10, label: 'Target', color: '#AABBCC', dash: 'dotted' }];
    const selection = { mode: 'internal', type: 'single' };
    const viewport = { mode: 'internal', axes: 'x' };
    const state = { mode: 'controlled', value: { hiddenSeriesIds: ['revenue'] } };
    const status = { type: 'loading', message: 'Waiting for forecast' };
    const result = validateColumn({ ...chart, ...appearance, axes: namedAxes, references, selection, viewport, state, status });
    expect(result).toMatchObject({
      status: 'ok',
      value: { ...appearance, axes: { ...namedAxes, y: { ...namedAxes.y, domain: [0, 15] } },
        references: [{ ...references[0], color: '#aabbcc' }], selection, viewport, state, status },
    });
    if (result.status !== 'ok') throw Error('Column canonical result expected.');
    expect(Object.isFrozen(result.value.state)).toBe(true);
    expect(result.value.series[0]!.data[1]!.y).toBeNull();
  });

  const invalidCases = [
    [{ axes: { x } }, 'BAD_COLUMN_SPEC', 'axes.y'],
    [{ title: '' }, 'BAD_COLUMN_SPEC', 'title'],
    [{ description: 'd'.repeat(2049) }, 'BAD_COLUMN_SPEC', 'spec.description'],
    [{ series: Array.from({ length: 17 }, () => series[0]) }, 'RESOURCE_LIMIT', 'series'],
    [{ series: Object.assign([...series], { note: 'custom' }) }, 'BAD_COLUMN_SPEC', 'series'],
    [{ orientation: 'radial' }, 'BAD_COLUMN_SPEC', 'spec.orientation'],
    [{ groupGap: 0.96 }, 'BAD_COLUMN_SPEC', 'spec.groupGap'],
    [{ maxBarWidth: 0.24 }, 'BAD_COLUMN_SPEC', 'spec.maxBarWidth'],
    [{ axes: { ...axes, y: { ...y, domain: [3] } } }, 'BAD_COLUMN_SPEC', 'axes.y.domain'],
    [{ axes: { ...axes, y: { ...y, domain: [3, 2] } } }, 'BAD_DOMAIN', 'axes.y.domain'],
    [{ axes: { ...axes, y: { ...y, ticks: { targetCount: 5.5 } } } }, 'BAD_COLUMN_SPEC', 'axes.y.ticks.targetCount'],
    [{ series: [{ ...series[0], color: 3 }] }, 'BAD_COLOR', 'series[0].color'],
    [{ series: [{ ...series[0], color: 'red' }] }, 'BAD_COLOR', 'series[0].color'],
    [{ series: [series[0], series[0]] }, 'DUPLICATE_ID', 'series[1].id'],
    [{ references: Array.from({ length: 2 }, () => ({ id: 'target', axis: 'y', value: 3 })) }, 'DUPLICATE_ID', 'references[1]'],
    [{ status: { type: 'error' } }, 'BAD_COLUMN_SPEC', 'status.message'],
    [{ status: { type: 'ready', message: 'Done' } }, 'BAD_COLUMN_SPEC', 'status.message'],
    [{ state: { mode: 'internal', value: { hiddenSeriesIds: [] } } }, 'BAD_COLUMN_SPEC', 'state.value'],
    [{ state: { mode: 'controlled', value: { hiddenSeriesIds: ['revenue', 'revenue'] } } }, 'BAD_STATE', 'state.value'],
  ] as const;
  it.each(invalidCases)('reports invalid column schema at %s', (patch, reason, path) => {
    expect(validateColumn({ ...chart, ...patch })).toMatchObject({ status: 'invalid', diagnostic: { reason, path } });
  });

  it('enforces a combined data budget before the final duplicated category can be read', () => {
    const largeValues = Array.from({ length: 10_000 }, (_, i) => ({ id: String(i) }));
    const largeData = largeValues.map(({ id }) => ({ id, x: id, y: 1 }));
    expect(validateColumn({
      ...chart, axes: { ...axes, x: { ...x, values: largeValues } },
      series: [{ ...series[0], data: largeData }, { id: 'forecast', name: 'Forecast', data: [largeData[0]] }],
    })).toMatchObject({ status: 'invalid', diagnostic: { reason: 'RESOURCE_LIMIT', path: 'series' } });
  });

  it('validates adapter state and preserves callback identity', () => {
    const onViewportChange = vi.fn();
    const initialState = { hiddenSeriesIds: ['revenue'] };
    expect(validateColumnOptions({ instanceId: 'first-chart', initialState, onViewportChange }, ids)).toMatchObject({
      status: 'ok', value: { initialState, onViewportChange },
    });
    expect(validateColumnOptions({ instanceId: '2nd' }, ids)).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'BAD_INSTANCE_ID', path: 'options.instanceId' },
    });
    expect(validateColumnOptions({ instanceId: 'valid', onSelectionChange: 'callback' }, ids)).toMatchObject({
      status: 'invalid', diagnostic: { path: 'options.onSelectionChange' },
    });
    expect(validateColumnState(initialState, ids, 'current')).toEqual({ status: 'ok', value: initialState });
    expect(validateColumnState({ hiddenSeriesIds: ['unknown'] }, ids, 'current')).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'BAD_STATE', path: 'current' },
    });
  });

  it('retains styled reference bands and rejects unknown category identities before projection', () => {
    const referenceBands = [
      {id: 'period', axis: 'x', from: 'actual', to: 'forecast', label: 'Forecast interval', opacity: 0},
      {id: 'amount', axis: 'y', from: -5, to: 10, color: '#ABCDEF', opacity: 1},
    ];
    const result = validateColumn({...chart, referenceBands, state: {mode: 'internal'}});
    expect(result).toMatchObject({status: 'ok', value: {
      referenceBands: [referenceBands[0], {...referenceBands[1], color: '#abcdef'}], state: {mode: 'internal'},
    }});
    expect(validateColumn({...chart, referenceBands: [{...referenceBands[0], to: 'lost'}]})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNKNOWN_CATEGORY', path: 'referenceBands[0]'},
    });
    expect(validateColumn({...chart, axes: {...axes, x: {...x, values: [x.values[0],x.values[0]]}}})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'DUPLICATE_ID', path: 'axes.x.values[1].id'},
    });
  });

  it('handles unreadable descriptors and nonindexed array keys without running user code', () => {
    const unreadable = new Proxy(chart, {ownKeys() { throw Error('Unavailable column data'); }});
    expect(validateColumn(unreadable)).toMatchObject({status: 'invalid', diagnostic: {reason: 'BAD_COLUMN_SPEC', path: 'spec'}});
    const data = [...series[0]!.data];
    let invoked = false;
    Object.defineProperty(data, '0', {get() { invoked = true; throw Error('Unexpected cell read'); }});
    expect(validateColumn({...chart, series: [{...series[0], data}]})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_COLUMN_SPEC', path: 'series[0].data'},
    });
    expect(invoked).toBe(false);
    const annotated = Object.assign([...series], {[Symbol('side')]: true});
    expect(validateColumn({...chart, series: annotated})).toMatchObject({status: 'invalid', diagnostic: {path: 'series'}});
  });
});
