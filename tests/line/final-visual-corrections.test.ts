import { it, expect } from 'vitest';
import { tooltipModel, detailText, fullX, duplicateCategoryLabels } from '../../src/internal/tooltip/model.js';
import { categoryEllipsis, type TextMeasurer } from '../../src/internal/layout/text.js';
import { planAxes } from '../../src/internal/axes/plan.js';
import { reviewFixture } from '../fixtures/review-fixtures.js';

it('V01 display identity is separate from canonical semantics and exact shared matching', () => {
  const labels = new Map([['c0', 'Mon'], ['c1', 'Sun'], ['a', '同じ😀'], ['b', '同じ😀'], ['u', '週末🌅']]);
  const series = [{ id: 's', name: 'S', color: '#123456', dash: 'solid' as const, byX: new Map([['a', { y: 3 }], ['c0', { y: 0 }]]) }, { id: 'other', name: 'Other', color: '#654321', dash: 'dashed' as const, byX: new Map([['b', { y: 7 }]]) }];
  for (const [x, display] of [['c0', 'Mon'], ['u', '週末🌅'], ['a', '同じ😀 (a)'], ['b', '同じ😀 (b)']]) {
    const model = tooltipModel(4, 's', 'p', x!, 'category', 'shared', series, labels, duplicateCategoryLabels(labels));
    expect(model.displayHeader).toBe(display); expect(model.header).toBe(fullX(x!, 'category', labels));
    expect(model.x).toBe(x); expect(detailText(model, 'Day')).toContain(model.header);
  }
  expect(tooltipModel(4, 's', 'p', 'a', 'category', 'shared', series, labels).rows.map(r => r.availability)).toEqual(['value', 'absent']);
  expect(tooltipModel(4, 's', 'p', 'b', 'category', 'shared', series, labels).rows.map(r => r.availability)).toEqual(['absent', 'value']);
});
const measurer: TextMeasurer = { measure: text => ({ width: Array.from(text).length * 7, height: 15, baseline: 12 }), invalidate() {}, destroy() {} };
it('V02 colliding prefixes retain distinct suffixes, code points and measured bounds', () => {
  for (const peers of [['A long category label with details 0', 'A long category label with details 6'], ['共通のとても長いカテゴリ😀', '共通のとても長いカテゴリ🌅']]) {
    const result = peers.map(text => categoryEllipsis(text, peers, 70, s => measurer.measure(s, {family:'sans-serif',size:12,weight:400}, 'ltr')));
    expect(new Set(result).size).toBe(2); expect(result.every(s => s!.startsWith('…'))).toBe(true);
    expect(result.every(s => Array.from(s!).length * 7 <= 70)).toBe(true);
    expect(result).toEqual(peers.map(text => categoryEllipsis(text, peers, 70, s => measurer.measure(s, {family:'sans-serif',size:12,weight:400}, 'ltr'))));
  }
  expect(categoryEllipsis('A', ['A', 'B'], 70, s => ({width:s.length*7,height:15,baseline:12}))).toBe('A');
  expect(categoryEllipsis('Long', ['Long'], 1, s => ({width:s.length*7,height:15,baseline:12}))).toBeNull();
});
it('V02 bounded plans keep distinguishable endpoints and full values at all review widths', () => {
  const values = Array.from({length:7}, (_,i) => ({id:'c'+i,label:'A long category label with details '+i})), labels = new Map(values.map(c => [c.id,c.label]));
  for (const width of [320,390,768,1280]) {
    const result = planAxes({x:{type:'category',values,title:'Period'},y:{type:'linear',title:'Value'},domains:{x:null,y:[0,10]},width:width-24,height:200,font:{family:'sans-serif',size:12,weight:400},direction:'ltr',labels,measurer,compact:width<640});
    expect(result.status).toBe('ok'); if(result.status!=='ok')continue;
    const endpoints = [result.value.x.labels[0]!, result.value.x.labels.at(-1)!];
    expect(endpoints[0]!.text).not.toBe(endpoints[1]!.text);
    for(const t of endpoints) { expect(t.full).toBe(labels.get(String(t.value))); expect(t.box.x).toBeGreaterThanOrEqual(0); expect(t.box.x+t.box.width).toBeLessThanOrEqual(width-24); }
  }
});
it('V05 review fixture separates step comparisons without changing canonical step geometry fixtures', () => {
  const spec = reviewFixture('steps'); expect(spec.series.map(s => s.curve)).toEqual(['step-before','step-after','step-mid']);
  expect(spec.series.map(s => s.name)).toEqual(['Before','After','Midpoint']);
  for (let i=0;i<7;i++) expect(new Set(spec.series.map(s => s.data[i]!.y)).size).toBe(3);
});
