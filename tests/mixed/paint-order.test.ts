import { expect, it } from 'vitest';
import { mixedPolicy } from '../../src/mixed/strategy.js';
import { shellFrame } from '../../src/internal/layout/frame.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { pointKey } from '../../src/line/normalize.js';
it('an opaque column owns a coincident Area anchor painted beneath it', () => {
  const policy = mixedPolicy(), spec = policy.parse({ family: 'mixed', title: 'Overlapping mark kinds', axes: { x: { kind: 'category', values: [{ id: 'a' }, { id: 'b' }] }, y: { kind: 'linear' } }, series: [{ kind: 'area', id: 'area', name: 'Envelope', markers: 'on', data: [{ id: 'a', x: 'a', y: 5 }, { id: 'b', x: 'b', y: 5 }] }, { kind: 'column', id: 'column', name: 'Actual', data: [{ id: 'a', x: 'a', y: 10 }, { id: 'b', x: 'b', y: 10 }] }] }); if (spec.status === 'invalid') throw Error(JSON.stringify(spec));
  const font = { family: 'sans-serif', size: 12, weight: 400 } as const, measurer = { measure(text: string) { return { width: text.length * 6, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} }, shell = shellFrame({ width: 768, height: 400 }, false, [], 'none', font, 'ltr', measurer), computed = policy.compute(spec.value, { hiddenSeriesIds: [] }, shell, defaultPalette('light', false), font, measurer); if (computed.status === 'invalid') throw Error(JSON.stringify(computed));
  const p = computed.value.projection, area = p.index.byId.get(pointKey('area', 'a'))!;
  expect(policy.pick(p, area.point.x, area.point.y)?.series.series.spec.id).toBe('column');
});
