import { expect, it } from 'vitest';
import { mixedPolicy } from '../../src/mixed/strategy.js';
import { shellFrame } from '../../src/internal/layout/frame.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
it('uses the normalized category-label index without scanning it for each tooltip', () => {
  const policy = mixedPolicy(), categories = Array.from({ length: 2500 }, (_, i) => ({ id: 'c' + i, label: 'Repeated ' + i % 3 })), parsed = policy.parse({ family: 'mixed', title: 'Hot lookup', axes: { x: { kind: 'category', values: categories }, y: { kind: 'linear' } }, series: [{ kind: 'line', id: 's', name: 'S', markers: 'off', data: categories.map((category, i) => ({ id: 'p' + i, x: category.id, y: i % 17 })) }] }); if (parsed.status === 'invalid') throw Error(JSON.stringify(parsed));
  const font = { family: 'sans-serif', size: 12, weight: 400 } as const, measurer = { measure(text: string) { return { width: text.length * 6, height: 15, baseline: 12 }; }, invalidate() {}, destroy() {} }, shell = shellFrame({ width: 768, height: 400 }, false, [], 'none', font, 'ltr', measurer), result = policy.compute(parsed.value, { hiddenSeriesIds: [] }, shell, defaultPalette('light', false), font, measurer); if (result.status === 'invalid') throw Error(JSON.stringify(result));
  const c = result.value, target = policy.reconcile(c.projection, null, 0)!, labels = c.projection.data.line.labels; let enumerations = 0;
  Object.defineProperty(labels, 'values', { configurable: true, value(this: Map<string, string>) { enumerations++; return Map.prototype.values.call(this); } });
  const tooltip = policy.tooltip(c, target, 1); expect(tooltip.rows[0]!.value).toBe(0); expect(tooltip.header).toBe('Repeated 0 (c0)'); expect(enumerations).toBe(0);
});
