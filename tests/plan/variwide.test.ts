import {describe, expect, it} from 'vitest';
import {planVariwide} from '../../src/plan/variwide.js';
import type {PlanVariwideResult, PlanVariwideSpec} from '../../src/public/variwide-plan-types.js';

const size = {width: 400, height: 320};
function spec(values: readonly Readonly<{y: number | null; z: number | null}>[] = [{y: 12, z: 1}, {y: 8, z: 2}, {y: -3, z: 3}]): PlanVariwideSpec {
  return {family: 'variwide', title: 'Output and capacity', axes: {x: {kind: 'category', values: values.map((_, i) => ({id: `c${i}`, label: `Category ${i}`}))}, y: {kind: 'linear', domain: [-10, 20]}},
    series: [{id: 'output', name: 'Output', data: values.map((value, i) => ({id: `p${i}`, x: `c${i}`, ...value}))}]};
}
function frame(result: PlanVariwideResult) {if (result.status === 'invalid') throw new Error(JSON.stringify(result.diagnostic)); return result.frame;}

describe('variwide source and geometry', () => {
  it('allocates actual widths proportionally to z, independently from y', () => {
    const result = frame(planVariwide(spec(), size)), bands = result.categoryBands;
    const widths = bands.map(band => band.right! - band.left!);
    expect(widths[1]! / widths[0]!).toBeCloseTo(2, 12);
    expect(widths[2]! / widths[0]!).toBeCloseTo(3, 12);
    expect(bands[0]!.left).toBe(66); expect(bands[2]!.right).toBe(388);
    expect(result.series[0]!.bars?.map(bar => bar.width)).toEqual(widths);
    expect(result.observations.map(point => point.value)).toEqual([12, 8, -3]);
    expect(result.observations.map(point => point.variwide.share)).toEqual([1 / 6, 1 / 3, .5]);
  });

  it('preserves known widths when a measured value is missing', () => {
    const result = frame(planVariwide(spec([{y: null, z: 1}, {y: 4, z: 1}]), size));
    expect(result.categoryBands[0]!.right! - result.categoryBands[0]!.left!).toBeCloseTo(161);
    expect(result.observations.map(point => point.id.pointId)).toEqual(['p1']);
    expect(result.variwideData[0]).toMatchObject({y: null, z: 1, missingValue: true, missingWidth: false});
  });

  it('does not coerce unknown widths to zero or distribute them equally', () => {
    const result = frame(planVariwide(spec([{y: 2, z: null}, {y: 4, z: 2}, {y: 7, z: 0}]), size));
    expect(result.categoryBands[0]).toMatchObject({left: null, right: null, status: 'unknown'});
    expect(result.variwideLayout).toEqual({status: 'ready', incomplete: true});
    expect(result.categoryBands[1]!.right! - result.categoryBands[1]!.left!).toBe(322);
    expect(result.categoryBands[2]).toMatchObject({status: 'zero', left: 388, right: 388});
    expect(result.observations.map(point => point.value)).toEqual([4, 7]);
    expect(result.observations[1]!.variwide).toMatchObject({z: 0, zeroWidth: true, geometryOmitted: true});
  });

  it('reports no proportional layout when all widths are zero/unknown', () => {
    const result = planVariwide(spec([{y: 0, z: 0}, {y: null, z: null}]), size);
    expect(result.status).toBe('empty');
    const scene = frame(result);
    expect(scene.variwideLayout).toEqual({status: 'no-positive-width', incomplete: true});
    expect(scene.series[0]!.bars).toEqual([]); expect(scene.observations).toEqual([]);
    expect(scene.variwideData[0]).toMatchObject({y: 0, z: 0, missingValue: false, missingWidth: false});
  });

  it('avoids overflow and exposes positive widths below projection precision', () => {
    const result = frame(planVariwide(spec([{y: 2, z: Number.MAX_VALUE}, {y: 4, z: Number.MAX_VALUE}, {y: 6, z: Number.MIN_VALUE}]), size));
    expect(result.categoryBands[0]!.right! - result.categoryBands[0]!.left!).toBe(161);
    expect(result.categoryBands[1]!.right! - result.categoryBands[1]!.left!).toBe(161);
    expect(result.categoryBands[2]).toMatchObject({z: Number.MIN_VALUE, left: 388, right: 388, status: 'below-precision'});
    expect(result.observations[2]!.variwide).toMatchObject({z: Number.MIN_VALUE, zeroWidth: false, geometryOmitted: true});
    expect(result.series[0]!.bars).toHaveLength(2);
    expect(result.series[0]!.circles?.[0]).toMatchObject({pointId: 'p2', cx: 388});
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it('keeps original IDs and exact zero when a marker replaces zero area', () => {
    const result = frame(planVariwide(spec([{y: 0, z: 1}]), size));
    expect(result.observations[0]).toMatchObject({id: {seriesId: 'output', pointId: 'p0'}, value: 0});
    expect(result.series[0]!.bars).toEqual([]); expect(result.series[0]!.circles).toHaveLength(1);
    expect(result.observations[0]!.hit).toMatchObject({kind: 'polygon'});
  });

  it('reflects actual weighted category bands when reversed', () => {
    const source = spec(), reverse: PlanVariwideSpec = {...source, axes: {...source.axes, x: {...source.axes.x, reversed: true}}};
    const a = frame(planVariwide(source, size)), b = frame(planVariwide(reverse, size));
    for (let i = 0; i < a.categoryBands.length; i++) {
      expect(b.categoryBands[i]!.left).toBeCloseTo(454 - a.categoryBands[i]!.right!, 10);
      expect(b.categoryBands[i]!.right).toBeCloseTo(454 - a.categoryBands[i]!.left!, 10);
    }
    expect(b.observations.map(point => point.id)).toEqual(a.observations.map(point => point.id));
  });

  it('hides and restores a series without stale geometry or changed source identities', () => {
    const source = spec(), before = frame(planVariwide(source, size));
    const hidden = frame(planVariwide(source, {...size, hiddenSeriesIds: ['output']}));
    expect(hidden.observations).toEqual([]); expect(hidden.series).toEqual([]);
    expect(hidden.categoryBands.every(band => band.status === 'hidden')).toBe(true);
    expect(hidden.variwideData.every(point => !point.visible)).toBe(true);
    expect(frame(planVariwide(source, size))).toEqual(before);
  });

  it('updates source values without changing unrelated IDs or weighted widths', () => {
    const source = spec(), updated = spec([{y: 5, z: 1}, {y: 2, z: 2}, {y: 9, z: 3}]);
    const a = frame(planVariwide(source, size)), b = frame(planVariwide(updated, size));
    expect(b.categoryBands).toEqual(a.categoryBands);
    expect(b.observations.map(point => point.id)).toEqual(a.observations.map(point => point.id));
    expect(b.observations.map(point => point.value)).toEqual([5, 2, 9]);
  });

  it('supports Y clipping and true weighted reference positions', () => {
    const result = frame(planVariwide(spec(), {...size, viewport: {axes: 'y', value: {y: [0, 5]}}, references: [{id: 'category', axis: 'x', value: 'c1'}, {id: 'goal', axis: 'y', value: 4}]}));
    expect(result.viewport?.axes).toBe('y');
    expect(result.observations.map(point => point.value)).toEqual([12, 8, -3]);
    expect(result.references?.[0]).toMatchObject({status: 'visible', line: {x1: result.observations[1]!.x}});
    expect(result.series[0]!.bars?.every(bar => bar.y >= 18 && bar.y + bar.height <= 276)).toBe(true);
  });

  it('does not treat absent source categories as fabricated data points', () => {
    const source = spec(), result = frame(planVariwide({...source, axes: {...source.axes, x: {...source.axes.x, values: [...source.axes.x.values, {id: 'absent', label: 'No observation'}]}}}, size));
    expect(result.categoryBands.at(-1)).toEqual({categoryId: 'absent', label: 'No observation', z: null, left: null, right: null, status: 'unknown'});
    expect(result.variwideData).toHaveLength(3);
    expect(result.variwideLayout.incomplete).toBe(true);
  });

  it('rejects unsupported X zoom, stacking, duplicate categories and invalid source before hiding', () => {
    expect(planVariwide(spec(), {...size, viewport: {axes: 'x'}})).toMatchObject({status: 'invalid', diagnostic: {reason: 'NUMERIC_Y_VIEWPORT_ONLY'}});
    expect(planVariwide(spec(), {...size, stacking: 'sum'})).toMatchObject({status: 'invalid'});
    const source = spec(), duplicate: PlanVariwideSpec = {...source, series: [{...source.series[0]!, data: [{id: 'one', x: 'c0', y: 1, z: 1}, {id: 'two', x: 'c0', y: 2, z: 3}]}]};
    expect(planVariwide(duplicate, {...size, hiddenSeriesIds: ['output']})).toMatchObject({status: 'invalid', diagnostic: {reason: 'DUPLICATE_CATEGORY'}});
    expect(planVariwide(spec([{y: 1, z: -1}]), {...size, hiddenSeriesIds: ['output']})).toMatchObject({status: 'invalid'});
  });

  it('bounds category and series complexity and rejects unknown legend IDs', () => {
    expect(planVariwide(spec(Array.from({length: 65}, () => ({y: 1, z: 1}))), size)).toMatchObject({status: 'invalid', diagnostic: {reason: 'RESOURCE_LIMIT'}});
    expect(planVariwide(spec(), {...size, hiddenSeriesIds: ['absent']})).toMatchObject({status: 'invalid', diagnostic: {reason: 'UNKNOWN_SERIES'}});
    const source = spec();
    expect(planVariwide({...source, series: [source.series[0], {...source.series[0], id: 'second'}]} as unknown as PlanVariwideSpec, size)).toMatchObject({status: 'invalid', diagnostic: {reason: 'RESOURCE_LIMIT'}});
  });

  it('owns and freezes outputs independently from caller mutation', () => {
    const source = spec(), before = JSON.stringify(source), result = frame(planVariwide(source, size));
    expect(JSON.stringify(source)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.variwideData[0])).toBe(true);
  });
});
