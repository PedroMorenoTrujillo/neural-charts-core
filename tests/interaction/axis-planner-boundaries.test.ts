import { describe, expect, it } from 'vitest';
import { planAxes } from '../../src/internal/axes/plan.js';
import type { AxisInput } from '../../src/internal/axes/plan.js';
import { invalid } from '../../src/internal/diagnostics.js';
import { createCategoryFrame, createPointScale } from '../../src/internal/math/category.js';

const dimensions = { width: 480, height: 270 };
const font = { family: 'sans-serif', size: 12, weight: 400 } as const;
const lifecycle = { invalidate() {}, destroy() {} };
const measurer = { ...lifecycle, measure: (label: string) => ({ width: label.length * 7, height: 14, baseline: 11 }) };
const linear: AxisInput = { type: 'linear', nice: false, ticks: { targetCount: 4 } };
const ticks = [{ id: 'first', label: 'Same episode' }, { id: 'next', label: 'Same episode' }];
const category: AxisInput = { type: 'category', values: ticks, reversed: true };
const context = {
  ...dimensions, x: linear, y: linear, domains: { x: [0, 10], y: [0, 10] },
  direction: 'ltr', labels: new Map<string, string>(), font, measurer,
} as const;

describe('axis planner layout and scale ownership', () => {
  it('keeps duplicate category labels identifiable with the reversed category Y axis', () => {
    const planned = planAxes({ ...context, y: category, domains: { ...context.domains, y: null } });
    if (planned.status !== 'ok') throw Error(planned.diagnostic.reason);
    const { value } = planned;
    expect(value.tooSmall).toBe(false);
    expect(value.y.labels.map(label => [label.value, label.full])).toEqual([['first', 'first'], ['next', 'next']]);
    expect(value.y.labels[0]!.position).toBeGreaterThan(value.y.labels[1]!.position);
    expect(value.mapY(0)).toBe(value.y.labels[0]!.position);
    expect(value.mapX('first')).toBeNull();
  });

  it.each([
    [{ x: [1, 0], y: [0, 10] }, 'domain'],
    [{ x: [0, 10], y: [1, 0] }, 'domain'],
  ] as const)('keeps invalid axis tick selections typed (case %#)', (domains, path) => {
    expect(planAxes({ ...context, domains })).toMatchObject({
      status: 'invalid', diagnostic: { code: 'INVALID_DOMAIN', path },
    });
  });

  it.each([
    [{ domains: { x: null, y: [0, 10] } }],
    [{ domains: { x: [0, 10], y: null } }],
    [{ y: { type: 'category', values: [] }, domains: { x: [0, 10], y: null } }],
    [{ height: 35 }],
  ] as const)('keeps empty or physically undersized plots free of fake pixel labels (case %#)', patch => {
    const result = planAxes({ ...context, ...patch });
    if (result.status !== 'ok') throw Error(result.diagnostic.reason);
    expect(result.value).toMatchObject({ tooSmall: true, x: { labels: [] }, y: { labels: [] } });
    expect(result.value.mapX(0)).toBeNull();
    expect(result.value.mapY(0)).toBeNull();
  });

  it('uses the supplied category mapping and forwards its diagnostic on failure', () => {
    const input = { ...context, x: category, domains: { x: null, y: [0, 10] } } as const;
    const swapped = planAxes({
      ...input, categoryX: plot => {
        const frame = createCategoryFrame(['next', 'first'], [plot.x, plot.x + plot.width], 0.5);
        return frame.status === 'invalid' ? frame : { status: 'ok', value: createPointScale(frame.value) };
      },
    });
    if (swapped.status !== 'ok') throw Error(swapped.diagnostic.reason);
    expect(swapped.value.mapX('first')).toBeGreaterThan(swapped.value.mapX('next')!);
    expect(swapped.value.mapX('unmapped')).toBeNull();
    expect(swapped.value.mapX(0)).toBeNull();
    expect(planAxes({ ...input, categoryX: () => invalid('INVALID_DOMAIN', 'INVALID_BAND', 'axes.x') })).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'INVALID_BAND', path: 'axes.x' },
    });
  });

  it('rejects duplicate categorical slots in each physical axis', () => {
    const duplicated: AxisInput = { ...category, values: [ticks[0]!, ticks[0]!] };
    expect(planAxes({ ...context, x: duplicated, domains: { ...context.domains, x: null } }).status).toBe('invalid');
    expect(planAxes({ ...context, y: duplicated, domains: { ...context.domains, y: null } }).status).toBe('invalid');
  });

  it('reduces dense ticks while keeping both endpoints usable and preserving signed orientation', () => {
    const dense = { type: 'linear', reversed: true, labels: { maxWidth: 200 }, ticks: { targetCount: 12 } } as const;
    const wideMeasurements = { ...lifecycle, measure: (label: string) => ({ width: label.length * 21, height: 29, baseline: 21 }) };
    const plan = planAxes({ ...context, ...{ width: 310, height: 173 }, direction: 'rtl', x: dense, y: dense,
      domains: { x: [100, 300], y: [100, 300] }, measurer: wideMeasurements });
    if (plan.status !== 'ok') throw Error(plan.diagnostic.reason);
    const { value } = plan;
    expect(value.tooSmall).toBe(false);
    expect(value.mapX(0)).toBeGreaterThan(value.mapX(400)!);
    expect(value.mapY(100)).toBeLessThan(value.mapY(300)!);
    expect(value.x.labels.some(label => label.text === null)).toBe(true);
    expect(value.y.labels.some(label => label.text === null)).toBe(true);
    for (const axis of [value.x, value.y]) {
      expect(axis.ticks).toContain(100);
      expect(axis.ticks).toContain(300);
    }
  });
});
