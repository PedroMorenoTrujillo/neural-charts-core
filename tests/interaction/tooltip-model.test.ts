import { expect, it } from 'vitest';
import { detailText, fullX, tooltipModel } from '../../src/internal/tooltip/model.js';
import type { TooltipSeries } from '../../src/internal/tooltip/model.js';

const labels = new Map([['a', 'Same title'], ['b', 'Same title'], ['latest', 'Today']]);
const zero: TooltipSeries = {id: 'zero', name: 'Measured', color: '#113355', dash: 'solid',
  byX: new Map([['a', {y: 0}], ['latest', {y: 2}]])};
const missing: TooltipSeries = {id: 'missing', name: 'Missing', color: '#446677', dash: 'dashed',
  byX: new Map([['a', {y: null}]])};
const absent: TooltipSeries = {id: 'absent', name: 'Absent', color: '#778899', dash: 'dotted',
  byX: new Map([['b', {y: 900}]])};

it('uses exact category identity for a shared tooltip with zero, missing and absent observations', () => {
  const model = tooltipModel(3, 'zero', 'p0', 'a', 'category', 'shared', [zero, missing, absent], labels);
  expect(model).toMatchObject({revision: 3, seriesId: 'zero', pointId: 'p0', x: 'a', header: 'Same title (a)', displayHeader: 'Same title (a)'});
  expect(model.rows.map(row => [row.seriesId, row.value, row.availability])).toEqual([
    ['zero', 0, 'value'], ['missing', null, 'null'], ['absent', null, 'absent'],
  ]);
  expect(detailText({...model, context: 'Revenue series'}, 'Use Tab to move')).toBe(
    'Same title (a). Measured: 0. Missing: Missing observation. Absent: No sample. Revenue series. Use Tab to move',
  );
  expect(Object.isFrozen(model.rows)).toBe(true);
  expect(model.rows.every(Object.isFrozen)).toBe(true);
});

it('uses the short unambiguous display label while retaining the point ID in the accessible tooltip', () => {
  const model = tooltipModel(1, 'zero', 'current', 'latest', 'category', 'point', [missing, zero, absent], labels);
  expect(model.header).toBe('Today (latest)');
  expect(model.displayHeader).toBe('Today');
  expect(model.rows).toEqual([{seriesId: 'zero', name: 'Measured', value: 2, availability: 'value', color: '#113355', dash: 'solid'}]);
  expect(detailText(model, '')).toBe('Today (latest). Measured: 2');
  expect(tooltipModel(2, 'missing', 'unknown', 'unlabeled', 'category', 'point', [zero, missing], labels)).toMatchObject({
    header: 'unlabeled', displayHeader: 'unlabeled', rows: [{seriesId: 'missing', value: null, availability: 'absent'}],
  });
});

it('formats original UTC sessions and normalizes negative zero in numeric headers', () => {
  const t = Date.UTC(2026, 10, 25, 16, 30);
  expect(fullX(t, 'time', labels)).toBe('2026-11-25T16:30:00.000Z');
  expect(fullX(-0, 'linear', labels)).toBe('0');
  expect(fullX(-3.5, 'linear', labels)).toBe('-3.5');
  expect(tooltipModel(1, 'zero', 'p', t, 'time', 'point', [], labels).displayHeader).toBe('2026-11-25T16:30:00.000Z');
});
