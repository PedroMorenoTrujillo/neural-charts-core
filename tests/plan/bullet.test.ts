import {describe, expect, it} from 'vitest';
import {planBullet} from '../../src/plan/bullet.js';
import type {PlanBulletResult, PlanBulletSpec} from '../../src/public/bullet-plan-types.js';

const size = {width: 400, height: 320};
function spec(): PlanBulletSpec {
  return {family: 'bullet', title: 'Measured output and targets', axes: {x: {type: 'category', values: [{id: 'one', label: 'One'}, {id: 'two', label: 'Two'}]}, y: {type: 'linear', domain: [-10, 20]}},
    bands: [{id: 'low', from: -10, to: 5, label: 'Low'}, {id: 'high', from: 5, to: 20, label: 'High'}],
    series: [{id: 'output', name: 'Output', data: [{id: 'p1', x: 'one', y: 8, target: 12}, {id: 'p2', x: 'two', y: -4, target: 0}]}]};
}
function frame(result: PlanBulletResult) {if (result.status === 'invalid') throw new Error(JSON.stringify(result.diagnostic)); return result.frame;}

describe('bullet values, independent targets and decorative bands', () => {
  it.each([
    ['horizontal', false], ['horizontal', true], ['vertical', false], ['vertical', true],
  ] as const)('keeps a common category coordinate for grouped %s values, reversed=%s', (orientation, reversed) => {
    const base = spec();
    const source: PlanBulletSpec = {...base, orientation, axes: {...base.axes, x: {...base.axes.x, reversed}},
      series: [...base.series, {id: 'secondary', name: 'Secondary', data: [
        {id: 'second-one', x: 'one', y: null, target: 0},
        {id: 'second-two', x: 'two', y: 5, target: 7},
      ]}]};
    const grouped = frame(planBullet(source, size));
    const hidden = frame(planBullet(source, {...size, hiddenSeriesIds: ['secondary']}));
    for (const category of source.axes.x.values) {
      const points = grouped.observations.filter(point => point.group?.key === category.id);
      const axisCenter = orientation === 'horizontal'
        ? grouped.yLabels?.find(label => label.id === category.id)?.y
        : grouped.labels.find(label => label.label === category.label)?.x;
      expect(axisCenter).toBeTypeOf('number');
      expect(points).toHaveLength(2);
      expect(new Set(points.map(point => point.group!.coordinate)).size).toBe(1);
      expect(points.every(point => point.group!.coordinate === axisCenter)).toBe(true);
      // Actual bar/target anchors stay in separate lanes; only group metadata is common.
      expect(orientation === 'horizontal' ? points[0]!.y : points[0]!.x)
        .not.toBe(orientation === 'horizontal' ? points[1]!.y : points[1]!.x);
      expect(hidden.observations.find(point => point.group?.key === category.id)?.group?.coordinate).toBe(axisCenter);
    }
    expect(grouped.observations.find(point => point.id.pointId === 'second-one')?.bullet)
      .toEqual({type: 'target', measure: null, target: 0});
  });

  it('returns genuine measurements and separate target lines in the same frame', () => {
    const result = frame(planBullet(spec(), size));
    expect(result.bulletOrientation).toBe('horizontal');
    expect(result.series).toHaveLength(1); expect(result.legend).toHaveLength(1);
    expect(result.observations.map(point => point.value)).toEqual([8, -4]);
    expect(result.bulletTargets.map(target => target.value)).toEqual([12, 0]);
    expect(result.bulletTargets[0]!.id).toEqual(result.observations[0]!.id);
    expect(result.bulletTargets[0]!.line!.x1).toBe(result.bulletTargets[0]!.line!.x2);
    expect(result.bulletBands).toHaveLength(2);
    expect(result.bulletBands[0]).toMatchObject({id: 'low', from: -10, to: 5, label: 'Low', status: 'visible'});
    expect(result.series[0]!.bars).toHaveLength(2);
  });

  it('does not use decorative bands to alter automatic numeric domains or selection', () => {
    const source = spec(), auto = {...source, axes: {...source.axes, y: {type: 'linear' as const}}};
    const a = frame(planBullet({...auto, bands: []}, size)), b = frame(planBullet({...auto, bands: [{id: 'enormous', from: -Number.MAX_VALUE, to: Number.MAX_VALUE}]}, size));
    expect(b.series).toEqual(a.series); expect(b.observations).toEqual(a.observations); expect(b.labels).toEqual(a.labels);
    expect(b.legend).toEqual(a.legend); expect(b.bulletData).toEqual(a.bulletData);
    expect(b.bulletBands[0]!.rect).toEqual({x: 90, y: 18, width: 298, height: 258});
  });

  it('includes actual targets in auto-domain independently from measured values', () => {
    const source = spec(), result = frame(planBullet({...source, axes: {...source.axes, y: {type: 'linear'}}, series: [{...source.series[0]!, data: [{id: 'p1', x: 'one', y: 2, target: 100}]}]}, size));
    expect(result.bulletTargets[0]).toMatchObject({value: 100, status: 'visible', line: {x1: 388, x2: 388}});
    expect(result.observations[0]!.x).toBeCloseTo(95.96);
  });

  it('preserves unknown, absent and exact zero targets distinctly', () => {
    const source = spec(), data = [{id: 'p1', x: 'one', y: 0, target: null}, {id: 'p2', x: 'two', y: 4}];
    const result = frame(planBullet({...source, series: [{...source.series[0]!, data}]}, size));
    expect(result.observations[0]!.bullet).toEqual({type: 'measure', measure: 0, target: null});
    expect(result.observations[1]!.bullet).toEqual({type: 'measure', measure: 4});
    expect(result.bulletTargets).toEqual([]); expect(result.series[0]!.circles).toHaveLength(1);
    expect(result.series[0]!.bars).toHaveLength(1);
    expect(frame(planBullet(spec(), size)).bulletTargets[1]).toMatchObject({value: 0, status: 'visible'});
  });

  it('keeps a known target accessible when its measurement is unknown without announcing zero', () => {
    const source = spec(), result = frame(planBullet({...source, series: [{...source.series[0]!, data: [{id: 'p1', x: 'one', y: null, target: 0}]}]}, size));
    expect(result.observations[0]).toMatchObject({id: {seriesId: 'output', pointId: 'p1'}, value: 0, bullet: {type: 'target', measure: null, target: 0}});
    expect(result.series[0]!.bars).toEqual([]); expect(result.series[0]!.circles).toEqual([]);
    expect(result.bulletTargets[0]!.line).toBeDefined();
    expect(result.bulletData[0]).toMatchObject({measure: null, target: 0, visible: true});
  });

  it('retains a completely missing row only in the source alternative', () => {
    const source = spec(), result = frame(planBullet({...source, series: [{...source.series[0]!, data: [{id: 'p1', x: 'one', y: null, target: null}]}]}, size));
    expect(result.observations).toEqual([]); expect(result.bulletTargets).toEqual([]);
    expect(result.bulletData).toEqual([{id: {seriesId: 'output', pointId: 'p1'}, categoryId: 'one', measure: null, target: null, visible: true}]);
  });

  it('projects vertical measures and targets without fake overlaid series', () => {
    const result = frame(planBullet({...spec(), orientation: 'vertical'}, size));
    expect(result.bulletOrientation).toBe('vertical'); expect(result.series).toHaveLength(1);
    expect(result.bulletTargets[0]!.line!.y1).toBe(result.bulletTargets[0]!.line!.y2);
    expect(result.labels.map(label => label.label)).toEqual(['One', 'Two']);
    expect(result.grid.length).toBeGreaterThan(0); expect(result.bulletGrid.length).toBe(result.grid.length);
    expect(result.observations[0]!.x).toBe(result.bulletTargets[0]!.line!.x1! / 2 + result.bulletTargets[0]!.line!.x2! / 2);
  });

  it('clips bands and marks out-of-domain targets without falsifying values', () => {
    const source = spec(), result = frame(planBullet({...source, bands: [{id: 'clip', from: -50, to: 0}, {id: 'outside', from: 30, to: 50}], series: [{...source.series[0]!, data: [{id: 'p1', x: 'one', y: 40, target: 30}]}]}, size));
    expect(result.bulletTargets[0]).toEqual({id: {seriesId: 'output', pointId: 'p1'}, value: 30, status: 'outside'});
    expect(result.bulletBands[0]!.rect!.x).toBe(90); expect(result.bulletBands[1]!.rect).toBeUndefined();
    expect(result.observations[0]!.value).toBe(40); expect(result.observations[0]!.x).toBe(388);
    expect(result.series[0]!.bars![0]!.x + result.series[0]!.bars![0]!.width).toBe(388);
  });

  it('groups real source series and reflows on hide without targets becoming legend entries', () => {
    const source = spec(), both = {...source, series: [...source.series, {...source.series[0]!, id: 'forecast', name: 'Forecast'}]};
    const before = frame(planBullet(both, size)), hidden = frame(planBullet(both, {...size, hiddenSeriesIds: ['output']}));
    expect(before.legend.map(item => item.id)).toEqual(['output', 'forecast']);
    expect(before.series).toHaveLength(2); expect(before.bulletTargets).toHaveLength(4);
    expect(hidden.bulletTargets).toHaveLength(2); expect(hidden.bulletTargets.every(target => target.id.seriesId === 'forecast')).toBe(true);
    expect(hidden.bulletData.filter(point => point.id.seriesId === 'output').every(point => !point.visible)).toBe(true);
    expect(hidden.observations[0]!.y).not.toBe(before.observations[2]!.y);
    expect(frame(planBullet(both, size))).toEqual(before);
  });

  it('supports category/value reversals and semantically aligned references', () => {
    const source = spec(), result = frame(planBullet({...source, axes: {x: {...source.axes.x, reversed: true}, y: {...source.axes.y, reversed: true}}}, {...size, references: [{id: 'row', axis: 'x', value: 'one'}, {id: 'value', axis: 'y', value: 10}]}));
    expect(result.observations[0]!.y).toBeGreaterThan(result.observations[1]!.y);
    expect(result.references?.[0]).toMatchObject({axis: 'x', status: 'visible', line: {y1: result.observations[0]!.y, y2: result.observations[0]!.y}});
    expect(result.references?.[1]!.line!.x1).toBe(result.references?.[1]!.line!.x2);
  });

  it('validates hidden source, unique IDs, ranges and complexity limits', () => {
    const source = spec();
    expect(planBullet({...source, bands: [{id: 'reverse', from: 2, to: 1}]}, size)).toMatchObject({status: 'invalid', diagnostic: {reason: 'EMPTY_OR_REVERSED_BAND'}});
    expect(planBullet({...source, series: [{...source.series[0]!, data: [{id: 'p1', x: 'one', y: NaN}]}]}, {...size, hiddenSeriesIds: ['output']})).toMatchObject({status: 'invalid', diagnostic: {reason: 'NONFINITE'}});
    expect(planBullet({...source, series: [source.series[0]!, source.series[0]!]}, size)).toMatchObject({status: 'invalid', diagnostic: {reason: 'DUPLICATE_ID'}});
    expect(planBullet({...source, bands: Array.from({length: 33}, (_, i) => ({id: String(i), from: i, to: i + 1}))}, size)).toMatchObject({status: 'invalid', diagnostic: {reason: 'RESOURCE_LIMIT'}});
  });

  it('rejects unimplemented viewport and stacking explicitly', () => {
    expect(planBullet(spec(), {...size, viewport: {axes: 'y'}})).toMatchObject({status: 'invalid', diagnostic: {reason: 'UNSUPPORTED_VIEWPORT'}});
    expect(planBullet(spec(), {...size, stacking: 'sum'})).toMatchObject({status: 'invalid', diagnostic: {reason: 'INCOMPATIBLE_STACKING'}});
    expect(planBullet(spec(), {...size, hiddenSeriesIds: ['unknown']})).toMatchObject({status: 'invalid', diagnostic: {reason: 'UNKNOWN_SERIES'}});
  });

  it('retains source identities across updates and freezes results', () => {
    const source = spec(), snapshot = JSON.stringify(source), a = frame(planBullet(source, size));
    const b = frame(planBullet({...source, series: [{...source.series[0]!, data: [{id: 'p1', x: 'one', y: 9, target: 11}, source.series[0]!.data[1]!]}]}, size));
    expect(a.observations.map(point => point.id)).toEqual(b.observations.map(point => point.id));
    expect(a.observations[0]!.bullet).not.toEqual(b.observations[0]!.bullet);
    expect(JSON.stringify(source)).toBe(snapshot); expect(Object.isFrozen(a.bulletTargets[0]!.line)).toBe(true);
  });
});
