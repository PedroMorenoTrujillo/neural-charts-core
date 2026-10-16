import { expect, test } from 'vitest';
import fc from 'fast-check';
import type { ChartResult } from '../../src/public/chart-types.js';
import type { ScatterChartSpec } from '../../src/scatter.js';
import { normalizeScatter, scatterDomains } from '../../src/scatter/data.js';
import { projectScatter } from '../../src/scatter/geometry.js';
import { scatterScene, scatterFocusScene } from '../../src/scatter/scene.js';
import { planAxes } from '../../src/internal/axes/plan.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { emptyLayers, frame } from '../../src/internal/axes/scene.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';
function value<T>(result: ChartResult<T>): T { if (result.status !== 'ok') throw Error(JSON.stringify(result)); return result.value; }
const font = { family: 'sans-serif', size: 12, weight: 400 } as const, palette = defaultPalette('light', false), state = { hiddenSeriesIds: [] };
const measurer = { measure: (text: string) => ({ width: text.length * 6, height: 15, baseline: 12 }), invalidate() {}, destroy() {} };
const basic: ScatterChartSpec = { family: 'scatter', title: 'XY', axes: { x: { kind: 'linear', domain: [-10, 10] }, y: { kind: 'linear', domain: [-10, 10] } }, series: [{ id: 's', name: 'Set', data: [{ id: 'a', x: -5, y: 6 }, { id: 'b', x: 0, y: 0 }, { id: 'c', x: 4, y: -4 }] }] };
function scene(spec = basic, width = 768, height = 320) {
  const data = value(normalizeScatter(spec)), domains = value(scatterDomains(data, state)), axes = value(planAxes({ x: spec.axes.x, y: spec.axes.y, domains, width, height, font, direction: spec.direction ?? 'ltr', labels: new Map(), measurer })), projection = value(projectScatter(data, state, axes)), layers = emptyLayers();
  value(scatterScene(projection, spec, palette, font, measurer.measure, layers)); expect(validateSceneFrame(frame(1, width, height, layers, axes)).status).toBe('ok'); return { projection, layers, axes };
}
test('three marker shapes use finite clipped primitives without a connecting path', () => {
  for (const shape of ['circle', 'square', 'diamond'] as const) {
    const spec: ScatterChartSpec = { ...basic, series: [{ ...basic.series[0]!, marker: { shape, size: 12 } }] }, { projection, layers, axes } = scene(spec);
    expect(layers.marks).toHaveLength(3); expect(layers.marks.every(mark => mark.clipKey === 'plot')).toBe(true);
    if (shape === 'diamond') for (const mark of layers.marks) { expect(mark.kind).toBe('path'); if (mark.kind === 'path') expect(mark.commands.map(command => command.kind)).toEqual(['M', 'L', 'L', 'L', 'Z']); }
    else expect(layers.marks.every(mark => mark.kind === (shape === 'circle' ? 'circle' : 'rect'))).toBe(true);
    scatterFocusScene(projection, projection.targets[0]!, palette, layers); expect(validateSceneFrame(frame(2, 768, 320, layers, axes)).status).toBe('ok'); expect(layers.interaction).toHaveLength(1);
  }
});
test('numeric X/Y reversed options affect geometry while input order and identity stay intact', () => {
  const normal = scene(), reversed = scene({ ...basic, axes: { x: { ...basic.axes.x, reversed: true }, y: { ...basic.axes.y, reversed: true } } });
  expect(normal.projection.targets.map(target => target.point.id)).toEqual(reversed.projection.targets.map(target => target.point.id));
  const p = normal.axes.plot, a = normal.projection.targets[0]!, b = reversed.projection.targets[0]!; expect(a.x + b.x).toBeCloseTo(2 * p.x + p.width, 10); expect(a.y + b.y).toBeCloseTo(2 * p.y + p.height, 10);
});
test('large datasets batch exact independent glyphs without omitting any observation', () => {
  for (const shape of ['circle', 'square', 'diamond'] as const) {
    const points = Array.from({ length: 5000 }, (_, index) => ({ id: String(index), x: index % 100 / 5 - 10, y: Math.floor(index / 100) / 5 - 5 })), { layers, projection } = scene({ ...basic, series: [{ id: 's', name: 'Set', marker: { shape, size: 4 }, data: points }] });
    expect(layers.marks).toHaveLength(Math.ceil(points.length / 256));
    const actual = layers.marks.flatMap(mark => { expect(mark.kind).toBe('path'); return mark.kind === 'path' ? mark.commands : []; });
    // Independent analytic bounds/area, not the production glyph constructor
    // used as its own expected answer. Every original target gets one contour.
    const contours: typeof actual[] = []; let contour: typeof actual = [];
    for (const command of actual) { contour.push(command); if (command.kind === 'Z') { contours.push(contour); contour = []; } }
    expect(contours).toHaveLength(projection.targets.length);
    for (let index = 0; index < contours.length; index++) {
      const commands = contours[index]!, target = projection.targets[index]!, vertices = commands.filter(command => command.kind !== 'Z');
      if (shape === 'circle') {
        const start = vertices[0]!, first = vertices[1]!, last = vertices[2]!;
        expect(start).toMatchObject({ x: target.x - target.radius, y: target.y }); expect(first).toMatchObject({ x: target.x + target.radius, y: target.y, radius: target.radius }); expect(last).toMatchObject({ x: target.x - target.radius, y: target.y, radius: target.radius });
      } else {
        let twiceArea = 0; for (let i = 0; i < vertices.length; i++) { const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!; twiceArea += (a.x - target.x) * (b.y - target.y) - (b.x - target.x) * (a.y - target.y); }
        expect(Math.abs(twiceArea) / 2).toBeCloseTo((shape === 'square' ? 4 : 2) * target.radius ** 2, 10);
        expect(Math.min(...vertices.map(v => v.x))).toBe(target.x - target.radius); expect(Math.max(...vertices.map(v => v.x))).toBe(target.x + target.radius);
        expect(Math.min(...vertices.map(v => v.y))).toBe(target.y - target.radius); expect(Math.max(...vertices.map(v => v.y))).toBe(target.y + target.radius);
      }
    }
    expect(actual.filter(command => command.kind === 'M')).toHaveLength(points.length); expect(actual.filter(command => command.kind === 'Z')).toHaveLength(points.length);
    if (shape === 'circle') { expect(actual.filter(command => command.kind === 'A')).toHaveLength(points.length * 2); expect(actual.some(command => command.kind === 'L')).toBe(false); }
  }
});
test('bounded labels fit the plot and stay separate from other labels/markers', () => {
  const { projection, layers } = scene({ ...basic, labels: 'auto' }), labels = layers.labels.filter(label => label.kind === 'text'); expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) if (label.kind === 'text') { const width = measurer.measure(label.text).width; expect(label.x - width / 2).toBeGreaterThanOrEqual(projection.plot.x); expect(label.x + width / 2).toBeLessThanOrEqual(projection.plot.x + projection.plot.width); }
  const points = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), x: index % 100 / 5 - 10, y: Math.floor(index / 100) - 5 }));
  const dense = scene({ ...basic, labels: 'auto', series: [{ id: 'dense', name: 'Dense', data: points }] }); expect(dense.layers.labels.length).toBeLessThanOrEqual(200); expect(dense.layers.marks).toHaveLength(1000);
  const duplicated = scene({ ...basic, labels: 'auto', series: [{ id: 'same', name: 'Same', data: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 }] }] }); expect(duplicated.layers.labels).toHaveLength(0);
});
test('invalid measurements are diagnosed and too-small plots never create invalid markers', () => {
  const { projection } = scene(); expect(scatterScene(projection, { ...basic, labels: 'auto' }, palette, font, () => ({ width: NaN, height: 15, baseline: 12 }), emptyLayers()).status).toBe('invalid');
  expect(scene(basic, 30, 20).layers.marks).toHaveLength(0);
});
test('extreme, tiny, negative and all-zero XY values produce finite certified SVG Scenes', () => {
  for (const coordinate of [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE, 0]) {
    const result = scene({ ...basic, axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Set', data: [{ id: 'one', x: coordinate, y: coordinate }] }] }); expect(result.layers.marks).toHaveLength(1);
  }
  const mixed = scene({ ...basic, axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's'.repeat(128), name: 'Set', data: [{ id: 'a'.repeat(128), x: -Number.MAX_VALUE, y: Number.MAX_VALUE }, { id: 'b'.repeat(128), x: Number.MAX_VALUE, y: -Number.MAX_VALUE }] }] });
  expect(mixed.layers.marks).toHaveLength(2); expect(mixed.layers.marks.every(mark => mark.key.length < 256)).toBe(true);
});
test('seeded unordered XY samples preserve all in-domain targets through shared scale/Scene', () => {
  fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 })), { minLength: 1, maxLength: 100 }), coordinates => {
    const points = coordinates.map(([x, y], index) => Object.freeze({ id: String(index), x, y })), spec: ScatterChartSpec = { ...basic, axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [{ id: 's', name: 'Set', data: Object.freeze(points) }] }, result = scene(spec);
    expect(result.layers.marks).toHaveLength(points.length); expect(result.projection.targets.map(target => target.point.id)).toEqual(points.map(point => point.id));
  }), { seed: 431223, numRuns: 150 });
});
