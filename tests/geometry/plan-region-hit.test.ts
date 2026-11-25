import { describe, expect, it } from 'vitest';
import { containsPlanHit, hitTestPlanRegion, preparePlanRegionHit } from '../../src/plan/hit.js';
import type { PlanFrame, PlanHitRegion, PlanObservation } from '../../src/public/plan-types.js';

function quad(left: number, top: number, width: number, height: number) {
  return [{x: left, y: top}, {x: left + width, y: top}, {x: left + width, y: top + height}, {x: left, y: top + height}];
}
function observation(rank: number, hit?: PlanHitRegion): PlanObservation {
  return {
    id: { seriesId: 'strata', pointId: String(rank) }, label: 'Level ' + rank, seriesName: 'Strata',
    value: rank, x: 0, y: 0, color: '#9abcde', ...(hit ? { hit } : {}),
  };
}
function frame(family: PlanFrame['family'], observations: readonly PlanObservation[]): PlanFrame {
  return { schema: 'nc-plan/1', family, title: 'Projected shapes', description: '', unit: '', width: 250, height: 250,
    legend: [], series: [], observations, grid: [], labels: [] };
}

describe('spatial hit index matches last-painted region geometry', () => {
  it.each(['horizontal', 'vertical'] as const)('keeps region membership and paint order in a %s layout', direction => {
    const move = (primary: number, secondary: number) => direction === 'horizontal' ? [primary, secondary] as const : [secondary, primary] as const;
    const block = (rank: number) => quad(...move(rank * 5, 0), ...move(11, 4));
    const strata = Array.from({ length: 21 }, (_, rank) => observation(rank, { type: 'polygon', vertices: block(rank) }));
    const top = observation(40, { type: 'compoundPolygon', polygons: [quad(...move(5, 0), ...move(2, 4)), quad(...move(50, 0), ...move(2, 4))] });
    const plan = frame('contour', [...strata, top, observation(41), observation(42, { type: 'compoundPolygon', polygons: [] })]);
    const index = preparePlanRegionHit(plan);
    expect(index).toBeDefined();
    expect(index!.query(...move(5, 1))).toBe(top);
    expect(index!.query(...move(8, 1))).toBe(strata[1]);
    expect(index!.query(...move(16, 1))).toBe(strata[3]);
    expect(index!.query(...move(50, 4))).toBe(top); // Inclusive polygon boundaries.
    expect(index!.query(...move(50, 7))).toBeUndefined();
    expect(index!.query(NaN, 1)).toBeUndefined();
    expect(hitTestPlanRegion(plan, NaN, 1)).toBeUndefined();
    for (let primary = -2; primary <= 112; primary++) {
      const point = move(primary, 1);
      expect(index!.query(...point)).toBe(hitTestPlanRegion(plan, ...point));
    }
  });

  it('does not make a selectable polygon from a line or invent an index for renderer-owned shapes', () => {
    expect(containsPlanHit({ type: 'polygon', vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }, 1, 0)).toBe(false);
    const mostlyEmpty = frame('pictorial', [observation(1), observation(2, { type: 'polygon', vertices: [] })]);
    expect(preparePlanRegionHit(mostlyEmpty)?.query(0, 0)).toBeUndefined();
    const delegated = frame('line', [observation(1)]);
    expect(preparePlanRegionHit(delegated)).toBeUndefined();
    expect(hitTestPlanRegion(delegated, 0, 0)).toBeUndefined();
  });
});
