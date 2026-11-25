import { expect, it } from 'vitest';
import { projectGauge } from '../../src/gauge/geometry.js';
import type { GaugeChartSpec } from '../../src/public/gauge-types.js';

const plot = {x: 20, y: 16, width: 360, height: 310};
const base = {family: 'gauge', title: 'Temperature', domain: [0, 100], unit: ' °C', value: 40} as const satisfies GaugeChartSpec;
const fontSize = 12;
function project(spec: GaugeChartSpec, dimensions = plot) {
  const result = projectGauge(spec, dimensions, fontSize);
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  return result.value;
}

it('uses independent arc and ring paths with finite original units and positive reading boxes', () => {
  const band = {id: 'safe', from: 25, to: 60, color: '#123456'};
  const target = {value: 50, label: 'Target'};
  const arc = project({...base, bands: [band], target});
  const ring = project({...base, preset: 'ring', bands: [band], target});
  expect(arc).toMatchObject({visualT: .4, state: 'within', start: -Math.PI / 2, span: Math.PI});
  expect(ring).toMatchObject({visualT: .4, state: 'within', start: 0, span: Math.PI * 2, readingBaseline: ring.frame.cy});
  expect(ring.track.filter(mark => mark.type === 'A')).toHaveLength(4);
  for (const result of [arc, ring]) {
    expect(result.bands.map(item => [item.id, item.color])).toEqual([['safe', '#123456']]);
    expect(result.target.map(mark => mark.type)).toEqual(['M', 'L']);
    expect(result.targetOutside).toBe(false);
    expect(result.readingBox.width).toBeGreaterThan(0);
    expect(result.readingBox.height).toBeGreaterThan(fontSize);
    expect(result.anchor.x).toBe(result.frame.cx);
  }
});

it('distinguishes an absent reading from known zero, underflow and overflow', () => {
  const cases = [
    [null, 'missing', null, false],
    [-20, 'under', 0, false],
    [0, 'within', 0, false],
    [125, 'over', 1, true],
  ] as const;
  for (const [value, state, visualT, hasForeground] of cases) {
    const result = project({...base, value, target: {value: 175}});
    expect(result.state).toBe(state);
    expect(result.visualT).toBe(visualT);
    expect(result.fill.length > 0).toBe(hasForeground);
    expect(result.targetOutside).toBe(true);
    expect(result.target).toEqual([]);
  }
});

it('returns an intentionally unpainted gauge for valid tiny layouts', () => {
  const result = project({...base, preset: 'ring', value: 5, target: {value: 25}}, {x: 0, y: 0, width: 14, height: 24});
  expect(result).toMatchObject({tooSmall: true, state: 'within', visualT: .05, track: [], fill: [], target: []});
});

it('diagnoses invalid geometry inputs passed by a chart owner', () => {
  for (const [source, dimensions, size, reason, path] of [
    [base, {...plot, width: -1}, fontSize, 'BAD_GAUGE_BOUNDS', 'plot'],
    [base, {...plot, height: -1}, fontSize, 'BAD_GAUGE_BOUNDS', 'plot'],
    [base, plot, 0, 'BAD_GAUGE_BOUNDS', 'plot'],
    [{...base, value: NaN}, plot, fontSize, 'UNREPRESENTABLE_GAUGE', 'value'],
    [{...base, bands: [{id: 'invalid', from: NaN, to: 80, color: '#123'}]}, plot, fontSize, 'UNREPRESENTABLE_GAUGE_BAND', 'bands'],
    [{...base, bands: [{id: 'invalid', from: 50, to: NaN, color: '#123'}]}, plot, fontSize, 'UNREPRESENTABLE_GAUGE_BAND', 'bands'],
    [{...base, target: {value: NaN}}, plot, fontSize, 'UNREPRESENTABLE_GAUGE_TARGET', 'target'],
  ] as const) {
    expect(projectGauge(source, dimensions, size)).toMatchObject({status: 'invalid', diagnostic: {reason, path}});
  }
  expect(projectGauge({...base, domain: [100, 0]}, plot, fontSize)).toMatchObject({status: 'invalid', diagnostic: {code: 'INVALID_DOMAIN'}});
});
