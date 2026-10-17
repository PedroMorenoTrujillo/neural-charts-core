import { describe, expect, it } from 'vitest';
import { validateGauge, validateGaugeOptions } from '../../src/gauge/validate.js';
import { projectGauge } from '../../src/gauge/geometry.js';
import { describeGauge } from '../../src/gauge/describe.js';
import { sectorPath as radialPath } from '../../src/radial/math.js';
import { sectorPath as oldPath } from '../../../../fixtures/gauge/radial-before/math.js';
import { sectorPath } from '../../src/internal/geometry/radial-sector.js';
import { serializePath } from '../../src/internal/geometry/path.js';
import type { GaugeChartSpec } from '../../src/public/gauge-types.js';
const spec: GaugeChartSpec = Object.freeze({ family: 'gauge', title: 'Pressure', value: 42, domain: Object.freeze([0, 100] as const), unit: 'kPa' });
const plot = Object.freeze({ x: 0, y: 0, width: 768, height: 360 });
function projection(value: GaugeChartSpec) { const result = projectGauge(value, plot, 14); expect(result.status).toBe('ok'); if (result.status === 'invalid') throw Error(result.diagnostic.reason); return result.value; }
describe('Gauge original-value domain and geometry', () => {
  it.each([[-10, 'under', 0], [0, 'within', 0], [42, 'within', .42], [100, 'within', 1], [150, 'over', 1], [null, 'missing', null]] as const)('preserves %s and visual range %s', (value, state, visualT) => {
    const p = projection({ ...spec, value }); expect(p.state).toBe(state); expect(p.visualT).toBe(visualT); expect(p.fill.length > 0).toBe(visualT !== null && visualT > 0);
    const description = describeGauge({ ...spec, value }); expect(description.status).toBe('ok'); if (description.status === 'ok') expect(description.value.table.rows[0]!.cells[2]).toBe(value === null ? 'Not supplied' : String(value));
  });
  it('normalizes overflowing-span domains through the frozen robust scale', () => { const p = projection({ ...spec, domain: [-Number.MAX_VALUE, Number.MAX_VALUE], value: 0 }); expect(p.visualT).toBe(.5); expect(serializePath(p.fill).status).toBe('ok'); });
  it('normalizes subnormal domain endpoints without collapsing the real zero', () => { const p = projection({ ...spec, domain: [-Number.MIN_VALUE, Number.MIN_VALUE], value: 0 }); expect(p.visualT).toBe(.5); });
  it('keeps negative values and an outside target without manufacturing a target mark', () => { const p = projection({ ...spec, domain: [-100, -10], value: -55, target: { value: 0 } }); expect(p.visualT).toBe(.5); expect(p.targetOutside).toBe(true); expect(p.target).toEqual([]); });
  it('uses a full ring with its real inner hole and no zero-length fill', () => { const p = projection({ ...spec, preset: 'ring', value: 100 }); expect(p.span).toBe(2 * Math.PI); expect(p.fill.filter(c => c.kind === 'A')).toHaveLength(4); expect(projection({ ...spec, preset: 'ring', value: 0 }).fill).toEqual([]); });
  it('spans only the upper semicircle left to right', () => { const p = projection({ ...spec, value: 100 }); expect(p.start).toBe(-Math.PI / 2); expect(p.span).toBe(Math.PI); for (const command of p.fill) if ('y' in command) expect(command.y).toBeLessThanOrEqual(p.frame.cy + 1e-12); });
  it('keeps all target/band extents within tiny, mobile and wide plots', () => { for (const width of [0, 8, 24, 80, 160, 320, 768, 1400]) for (const height of [0, 24, 100, 240, 440]) for (const preset of ['arc', 'ring'] as const) {
    const result = projectGauge({ ...spec, preset, target: { value: 100 }, bands: [{ id: 'full', from: 0, to: 100, color: '#123456' }] }, { x: 13, y: 17, width, height }, 14); expect(result.status).toBe('ok'); if (result.status === 'invalid') continue; const p = result.value;
    for (const commands of [p.track, p.fill, p.target, ...p.bands.map(band => band.commands)]) { expect(serializePath(commands).status).toBe('ok'); for (const command of commands) if ('x' in command) { expect(command.x).toBeGreaterThanOrEqual(13 - 1e-10); expect(command.x).toBeLessThanOrEqual(13 + width + 1e-10); expect(command.y).toBeGreaterThanOrEqual(17 - 1e-10); expect(command.y).toBeLessThanOrEqual(17 + height + 1e-10); } }
  } });
});
describe('Gauge strict immutable public input', () => {
  it('retains opaque datum by reference without invoking its accessors', () => { const datum = Object.freeze({ get secret(): never { throw Error('must not traverse'); } }), input = Object.freeze({ ...spec, datum, target: Object.freeze({ value: 60 }), bands: Object.freeze([Object.freeze({ id: 'low', from: 0, to: 40, color: '#123456' })]) }); const parsed = validateGauge(input); expect(parsed.status).toBe('ok'); if (parsed.status === 'ok') { expect(parsed.value.datum).toBe(datum); expect(parsed.value).not.toBe(input); expect(Object.isFrozen(parsed.value.bands)).toBe(true); } });
  it.each([NaN, Infinity, -Infinity, undefined, '3'])('rejects invalid scalar %s', value => { expect(validateGauge({ ...spec, value }).status).toBe('invalid'); });
  it.each([[0, 0], [1, -1], [0, Infinity], [0], [0, 1, 2]])('rejects invalid domain %j', (...domain) => { expect(validateGauge({ ...spec, domain }).status).toBe('invalid'); });
  it('rejects overlapping, unordered, outside and duplicate bands', () => {
    for (const bands of [ [{ id: 'a', from: 0, to: 60, color: '#123456' }, { id: 'b', from: 50, to: 100, color: '#123456' }], [{ id: 'a', from: -1, to: 30, color: '#123456' }], [{ id: 'a', from: 1, to: 1, color: '#123456' }], [{ id: 'a', from: 0, to: 30, color: '#123456' }, { id: 'a', from: 30, to: 80, color: '#123456' }] ]) expect(validateGauge({ ...spec, bands }).status).toBe('invalid');
  });
  it('allows adjacent intervals and neutral gaps without implicit warning colors', () => { expect(validateGauge({ ...spec, bands: [{ id: 'a', from: 0, to: 30, color: '#123456' }, { id: 'b', from: 30, to: 40, color: '#456789' }, { id: 'c', from: 80, to: 100, color: '#789abc' }] }).status).toBe('ok'); });
  it('rejects unknown options and fake selection/viewport/state/activation contracts', () => { for (const name of ['selection', 'viewport', 'state', 'series', 'needle']) expect(validateGauge({ ...spec, [name]: {} }).status).toBe('invalid'); for (const name of ['onSelectionChange', 'onViewportChange', 'onStateChange', 'onPointActivate']) expect(validateGaugeOptions({ instanceId: 'gauge', [name]: () => {} }).status).toBe('invalid'); });
  it('does not invoke a scalar property accessor', () => { let calls = 0; expect(validateGauge({ ...spec, get value() { calls++; return 3; } }).status).toBe('invalid'); expect(calls).toBe(0); });
});
describe('neutral own arc extraction', () => {
  it('preserves exact existing Pie commands and validation for deterministic varied inputs', () => {
    let seed = 123456789; const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    for (let i = 0; i < 2000; i++) { const radius = 1 + random() * 2000, frame = { cx: random() * 500, cy: random() * 500, radius, innerRadius: i % 3 ? radius * random() * .99 : 0 }, start = random() * Math.PI * 2, end = start + random() * (Math.PI * 2 - start); expect(radialPath(frame, start, i % 11 ? end : Math.PI * 2)).toEqual(oldPath(frame, start, i % 11 ? end : Math.PI * 2)); }
    for (const [start, end] of [[0, 0], [0, Math.PI * 2], [-Math.PI / 2, Math.PI / 2], [2, 1], [0, Infinity]]) expect(radialPath({ cx: 2, cy: 3, radius: 20, innerRadius: 10 }, start!, end!)).toEqual(oldPath({ cx: 2, cy: 3, radius: 20, innerRadius: 10 }, start!, end!));
  });
  it('extends only the private primitive for a negative-start upper arc', () => { expect(sectorPath({ cx: 20, cy: 20, radius: 10, innerRadius: 8 }, -Math.PI / 2, Math.PI / 2).status).toBe('ok'); expect(radialPath({ cx: 20, cy: 20, radius: 10, innerRadius: 8 }, -Math.PI / 2, Math.PI / 2).status).toBe('invalid'); });
});
