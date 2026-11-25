import { describe, expect, it } from 'vitest';
import { validateHeatmap, validateHeatmapOptions } from '../../src/heatmap/validate.js';
import {
  firstHeatmapTarget, heatmapIdentity, heatmapOrder, navigateHeatmap,
  pickHeatmap, projectHeatmap, reconcileHeatmap,
} from '../../src/heatmap/geometry.js';
import { heatmapReferenceContext, heatmapReferencesScene } from '../../src/heatmap/references.js';
import { planAxes } from '../../src/internal/axes/plan.js';
import { axesScene, emptyLayers, frame } from '../../src/internal/axes/scene.js';
import { drawReferenceBands, referenceBandContext } from '../../src/internal/axes/reference-band-view.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { insideLabelInk } from '../../src/internal/layout/contrast.js';
import type { ChartResult } from '../../src/public/chart-types.js';

function accept<T>(result: ChartResult<T>): T {
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  return result.value;
}

const columns = [{ id: 'a', label: 'Annual' }, { id: 'b', label: 'Annual' }, { id: 'c' }];
const rows = [{ id: 'start', label: 'Period start' }, { id: 'middle' }, { id: 'end' }];
const axes = {
  x: { type: 'category', values: columns, title: 'Fuente', grid: true, ticks: { targetCount: 3 }, labels: { maxWidth: 64 } },
  y: { type: 'category', values: rows, title: 'Periodo', grid: false },
} as const;
const points = [
  { id: 'zero', rowId: 'start', columnId: 'a', value: 0, datum: { site: 1 } },
  { id: 'rest', rowId: 'start', columnId: 'c', value: null },
  { id: 'peak', rowId: 'middle', columnId: 'b', value: 14 },
];
const reference = { id: 'start-line', axis: 'x', value: 'a', label: 'Guide', color: '#1734b2', dash: 'solid' };
const range = { id: 'period', axis: 'y', from: 'start', to: 'middle', label: 'In scope' };
const source = {
  family: 'heatmap', title: 'Densidad', description: '', labels: 'off', theme: 'auto', direction: 'rtl',
  font: { family: 'serif', size: 12, weight: 700 }, legend: { position: 'bottom' },
  tooltip: { mode: 'off', placement: 'bottom' }, status: { type: 'error', message: 'No disponible' },
  motion: 'none', crosshair: 'x', gapRatio: 0.1, data: points, axes, references: [reference], referenceBands: [range],
};
const measurer = {
  measure: (text: string) => ({ width: text.length * 6, height: 12, baseline: 9 }),
  invalidate() {},
  destroy() {},
};

function projection(reversed = false) {
  const chartAxes = { x: { ...axes.x, reversed }, y: { ...axes.y, reversed } };
  const data = accept(validateHeatmap({ ...source, axes: chartAxes, status: { type: 'ready' } }));
  const plan = accept(planAxes({
    ...chartAxes, domains: { x: null, y: null }, width: 460, height: 320,
    labels: data.columnLabels, yLabels: data.rowLabels, font: { family: 'serif', size: 12, weight: 700 },
    direction: reversed ? 'rtl' : 'ltr', measurer,
  }));
  return accept(projectHeatmap(data, plan));
}

describe('heatmap scale, selection and scoped transport', () => {
  it.each([
    [{type: 'threshold', colors: ['#000', '#ABCDEF'], boundaries: [4]}, ['#000000', '#abcdef']],
    [{type: 'diverging', colors: ['#000', '#123456', '#fff'], domain: [-10, 0, 10]}, ['#000000', '#123456', '#ffffff']],
    [{type: 'sequential', colors: ['#FF0066', '#123'], positions: [0, 1]}, ['#ff0066', '#112233']],
    [{type: 'sequential', colors: ['#000', '#fff'], positions: [0, 1], domain: [-10, 30]}, ['#000000', '#ffffff']],
  ] as const)('owns an immutable color-scale description (case %#)', (colorScale, colors) => {
    const canonical = accept(validateHeatmap({...source, colorScale})).spec.colorScale;
    expect(canonical).toMatchObject({...colorScale, colors});
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical?.colors)).toBe(true);
  });

  it('owns controlled cell selection alongside independent categorical viewport windows', () => {
    const selection = {mode: 'controlled', type: 'multiple', value: [{pointId: 'zero'}, {pointId: 'peak'}]};
    const viewport = {mode: 'controlled', axes: 'xy', value: {x: {firstId: 'a', lastId: 'b'}, y: {firstId: 'start', lastId: 'end'}}};
    const owned = accept(validateHeatmap({...source, selection, viewport})).spec;
    expect(owned.selection).toEqual(selection);
    expect(owned.viewport).toMatchObject(viewport);
    expect(Object.isFrozen(owned.selection)).toBe(true);
    expect(Object.isFrozen(owned.viewport)).toBe(true);
    expect(accept(validateHeatmap({...source, selection: false, viewport: false})).spec).toMatchObject({selection: false, viewport: false});
    expect(accept(validateHeatmap({...source, selection: {mode: 'internal'}, viewport: {mode: 'internal', axes: 'x'}})).spec.selection)
      .toEqual({mode: 'internal', type: 'single'});
  });

  it('rejects foreign original cells and numeric axes for controlled and uncontrolled owners', () => {
    expect(validateHeatmap({...source, selection: {mode: 'internal', initial: [{pointId: 'zero', seriesId: 'not-a-cell'}]}})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_SELECTION_ID', path: 'selection'},
    });
    expect(validateHeatmap({...source, selection: {mode: 'controlled', value: [{pointId: 'removed'}]}})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNKNOWN_SELECTION'},
    });
    for (const viewport of [
      {mode: 'controlled', axes: 'x', value: {x: [0,1]}},
      {mode: 'internal', axes: 'y', initial: {y: [0,1]}},
    ]) expect(validateHeatmap({...source, viewport})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_CATEGORY_WINDOW', path: 'viewport'},
    });
    expect(validateHeatmap({...source, referenceBands: [{...range, to: 'unknown'}]})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNKNOWN_CATEGORY', path: 'referenceBands[0]'},
    });
    const blocked = new Proxy({}, {ownKeys() { throw Error('Unavailable configuration'); }});
    expect(validateHeatmap(blocked)).toMatchObject({status: 'invalid', diagnostic: {reason: 'BAD_SPEC', path: 'spec'}});
    expect(validateHeatmapOptions(blocked)).toMatchObject({status: 'invalid', diagnostic: {reason: 'BAD_OPTIONS', path: 'options'}});
  });

  it('declines pick targets for absent rows or columns, including duplicate viewport transport', () => {
    const current = projection(), data = current.data, plan = current.axes;
    const empty = accept(projectHeatmap(data, {...plan, tooSmall: true}, {x: {type: 'category'}, y: {type: 'category'}}));
    expect(empty.cells).toEqual([]);
    expect(pickHeatmap(empty, 50, 50)).toBeNull();
    expect(reconcileHeatmap(empty, 'missing-id', 21)).toBeNull();
    const bad = {type: 'category', values: [{id: 'a'}, {id: 'a'}]} as const;
    expect(projectHeatmap(data, plan, {...axes, x: bad}).status).toBe('invalid');
    expect(projectHeatmap(data, plan, {...axes, y: bad}).status).toBe('invalid');
    const visible = accept(projectHeatmap(data, plan, {x: {...axes.x, values: [columns[2]!]}, y: {...axes.y, values: [rows[2]!]}}));
    expect(visible.cells).toEqual([]);
    expect(firstHeatmapTarget(visible)?.cell).toBeNull();
  });
});

describe('heatmap data, axes and interaction contracts', () => {
  it('uses default spacing and rejects partial projection when either band scale loses precision', () => {
    const data = accept(validateHeatmap({family:'heatmap',title:'Period measures',axes,data:points}));
    const plan = projection().axes;
    const projected = accept(projectHeatmap(data, plan));
    const a = projected.xScale?.band('a');
    expect(a?.width).toBeCloseTo(plan.plot.width / columns.length * 0.96, 10);
    const gapless = accept(validateHeatmap({...source,gapRatio:0}));
    const visible={x:{...axes.x,values:columns.slice(0,2)},y:{...axes.y,values:rows.slice(0,2)}};
    for(const plot of [{...plan.plot,x:1e16,width:2},{...plan.plot,y:1e16,height:2}]){
      expect(projectHeatmap(gapless,{...plan,plot},visible)).toMatchObject({
        status:'invalid',diagnostic:{reason:'UNREPRESENTABLE',path:'bands'},
      });
    }
  });

  it('distinguishes original zeros, explicit missing values and absent coordinate pairs', () => {
    const projected = projection();
    const zero = projected.targetAt(0, 0);
    const absent = projected.targetAt(1, 0);
    const missing = projected.targetAt(0, 2);
    if (!zero || !absent || !missing) throw Error('Expected three coordinate targets');
    expect(zero.cell?.value).toBe(0);
    expect(absent.cell).toBeNull();
    expect(missing.cell?.value).toBeNull();
    expect(projected.cells.map(target => target.cell?.id)).toEqual(['zero', 'peak']);
    expect(projected.byId.get('rest')).toBe(missing);
    expect(firstHeatmapTarget(projected)).toBe(zero);
    expect(pickHeatmap(projected, zero.cx, zero.cy)).toBe(zero);
    expect(pickHeatmap(projected, projected.axes.plot.x - 1, zero.cy)).toBeNull();
    expect(pickHeatmap(projected, zero.cx, projected.axes.plot.y - 1)).toBeNull();
    for (const [row, column] of [[0.5, 0], [0, 0.5], [-1, 0], [3, 0], [0, -1], [0, 3]] as const) {
      expect(projected.targetAt(row, column)).toBeNull();
    }
    expect(heatmapOrder(projected, missing)).toBe(2);
    expect(heatmapIdentity(zero)).toBe('d:4:zero');
    expect(reconcileHeatmap(projected, heatmapIdentity(zero), 0)).toBe(zero);
    expect(reconcileHeatmap(projected, heatmapIdentity(absent), 3)).toEqual(absent);
    expect(reconcileHeatmap(projected, null, 4)).toBe(zero);
    for (const id of ['d:9:zero', 'd:4:lost', 'm:invalid json', 'm:[0,1]', 'm:["end","missing"]', 'm:["end"]']) {
      expect(reconcileHeatmap(projected, id, 2)).toBe(missing);
    }
    expect(projected.data.columnLabels.get('a')).toBe('Annual · a');
    expect(projected.data.extent).toEqual([0, 14]);
  });

  it.each([false, true])('uses logical order for controls and visual order for arrows, reversed=%s', reversed => {
    const projected = projection(reversed);
    const center = projected.targetAt(1, 1);
    if (!center) throw Error('Expected center of matrix');
    const [first, last] = reversed ? [2, 0] : [0, 2];
    const expected = [
      ['ArrowLeft', false, 1, first], ['ArrowRight', false, 1, last],
      ['ArrowUp', false, first, 1], ['ArrowDown', false, last, 1],
      ['Home', false, 1, first], ['End', false, 1, last],
      ['Home', true, first, first], ['End', true, last, last],
    ] as const;
    for (const [key, control, row, column] of expected) {
      expect(navigateHeatmap(projected, center, key, control)).toMatchObject({ row, column });
    }
    expect(navigateHeatmap(projected, center, 'Escape', false)).toBeNull();
    const edge = firstHeatmapTarget(projected);
    if (!edge) throw Error('Expected first logical target');
    expect(navigateHeatmap(projected, edge, 'ArrowLeft', false)).toBe(edge);
  });

  it('retains original reference descriptions and renders only visible references above the marks', () => {
    const { data, axes: plan } = projection();
    const references = data.spec.references;
    const bands = data.spec.referenceBands;
    const light = defaultPalette('light', false);
    const layers = emptyLayers();
    axesScene(plan, axes.x, axes.y, light, layers, true);
    heatmapReferencesScene(references, plan, axes, light, layers, measurer);
    expect(accept(drawReferenceBands(bands, plan, axes, axes, light, layers, measurer, false, true))).toBeUndefined();
    expect(layers.axes.map(item => item.key)).toContain('x-baseline');
    expect(layers.grid.every(item => item.clipKey === 'plot' && item.key.startsWith('x-'))).toBe(true);
    expect(layers['reference-lines'].map(item => item.key)).toEqual(['r:10:start-line', 'band-outline:6:period']);
    expect(layers.labels.find(item => item.key === 'r:10:start-line-label-backplate')).toMatchObject({ clipKey: 'plot', type: 'rect' });
    expect(layers['reference-bands']).toEqual([]);
    expect(frame(4, 460, 320, layers, plan).defs).toEqual([{ type: 'clip-rect', key: 'plot', ...plan.plot }]);
    expect(frame(4, 460, 320, layers).defs).toEqual([]);
    expect(heatmapReferenceContext(references, axes)).toContain('Annual (a)');
    expect(referenceBandContext(bands, axes)).toContain('Period start (start)');

    const clipped = { x: { ...axes.x, values: columns.slice(1) }, y: axes.y };
    const clippedLayers = emptyLayers();
    heatmapReferencesScene(references, plan, clipped, light, clippedLayers, measurer);
    expect(clippedLayers['reference-lines']).toEqual([]);
    expect(heatmapReferenceContext(undefined, axes)).toBe('');
    expect(referenceBandContext([], axes)).toBe('');
  });

  it('projects visible row references by local rank and omits original rows outside the crop', () => {
    const full = projection();
    const scoped = {x: axes.x, y: {...axes.y, values: [rows[1]!, rows[2]!]}};
    const plan = accept(planAxes({...scoped, domains: {x: null, y: null}, width: 460, height: 320,
      labels: full.data.columnLabels, yLabels: full.data.rowLabels, font: full.axes.font, direction: 'ltr', measurer}));
    const refs = [
      {id: 'cutoff', axis: 'y', value: 'middle'},
      {id: 'start', axis: 'y', value: 'start', label: 'Original first row'},
    ] as const;
    const palette = defaultPalette('light', false), layers = emptyLayers();
    heatmapReferencesScene(refs, plan, scoped, palette, layers, measurer);
    expect(layers['reference-lines']).toHaveLength(1);
    expect(layers['reference-lines'][0]).toMatchObject({key: 'r:6:cutoff', y1: plan.mapY(0), y2: plan.mapY(0)});
    expect(heatmapReferenceContext(refs, axes)).toContain('cutoff. Y middle');
    expect(heatmapReferenceContext(refs, axes)).toContain('Original first row. Y Period start (start)');
    const blank = emptyLayers();
    heatmapReferencesScene(refs, {...plan, tooSmall: true}, scoped, palette, blank, measurer);
    heatmapReferencesScene(undefined, plan, scoped, palette, blank, measurer);
    expect(blank['reference-lines']).toEqual([]);
  });

  it('isolates invalid axis options, references, cell identities and renderer callbacks', () => {
    const bad = [
      [{ axes: { ...axes, x: { ...axes.x, ticks: { targetCount: 3.5 } } } }, 'axes.x.ticks.targetCount'],
      [{ axes: { ...axes, x: { ...axes.x, grid: 1 } } }, 'axes.x.grid'],
      [{ references: [{ ...reference, value: 'missing' }] }, 'references[0].value'],
      [{ references: [reference, reference] }, 'references[1].id'],
      [{ data: [points[0], { ...points[0], id: 'new-id' }] }, 'data[1]'],
      [{ data: [{ ...points[0], columnId: 'missing' }] }, 'data[0]'],
      [{ status: { type: 'error' } }, 'spec.status.message'],
      [{ selection: { mode: 'controlled', value: [{ pointId: 'zero', seriesId: 'other' }] } }, 'selection'],
      [{ viewport: { mode: 'controlled', axes: 'x', value: { x: [0, 1] } } }, 'viewport'],
    ] as const;
    for (const [patch, path] of bad) {
      expect(validateHeatmap({ ...source, ...patch })).toMatchObject({ status: 'invalid', diagnostic: { path } });
    }
    const valid = validateHeatmap({
      ...source, selection: { mode: 'controlled', value: [{ pointId: 'zero' }] },
      viewport: { mode: 'internal', axes: 'x', initial: { x: { firstId: 'a', lastId: 'c' } } },
    });
    expect(valid.status).toBe('ok');
    expect(validateHeatmapOptions({ instanceId: 'heatmap' }).status).toBe('ok');
    expect(validateHeatmapOptions({ instanceId: 'heatmap-1', onDiagnostic: false })).toMatchObject({
      status: 'invalid', diagnostic: { path: 'options.onDiagnostic' },
    });
    expect(validateHeatmapOptions({ instanceId: '/chart id' })).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'BAD_INSTANCE_ID' },
    });
  });

  it.each([
    ['#000', '#fff', '#ffffff'], ['#fff', '#000', '#000000'],
    ['#0000', '#ffffff', '#000000'], ['#000f', 'unknown', '#ffffff'],
    ['#ffffff11', '#10101020', null], ['rebeccapurple', '#fff', null],
  ])('chooses a contrast foreground for %s on %s', (fill, surface, expected) => {
    expect(insideLabelInk(fill, surface)).toBe(expected);
  });
});
