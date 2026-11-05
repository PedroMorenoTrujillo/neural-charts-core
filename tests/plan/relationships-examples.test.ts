import {describe, expect, it} from 'vitest';
import {planChart} from '../../src/plan.js';
import {relationshipCopy, relationshipExamples, relationshipExampleSpec} from '../fixtures/relationships/relationship-examples.js';
import {relationshipDetails, relationshipNumber, relationshipPrimaryLabel} from '../fixtures/relationships/relationship-format.js';

const families = ['dependencywheel', 'arcdiagram', 'chord'] as const;
const size = {width: 390, height: 320};
describe('relationship showcase preparation', () => {
  it('plans all18 bilingual source variants with unchanged identities', () => {
    for (const family of families) {
      const en = relationshipExamples(family, 'en'), es = relationshipExamples(family, 'es');
      expect(en).toHaveLength(6); expect(es.map(example => example.id)).toEqual(en.map(example => example.id));
      for (const example of en) {
        const a = relationshipExampleSpec(family, example.id, 'en'), b = relationshipExampleSpec(family, example.id, 'es');
        const source = JSON.stringify(a);
        expect(a.nodes.map(node => node.id)).toEqual(b.nodes.map(node => node.id));
        expect(a.links.map(link => link.id)).toEqual(b.links.map(link => link.id));
        const english = planChart(a, size), spanish = planChart(b, size);
        expect(english.status, family + ':' + example.id).not.toBe('invalid');
        expect(spanish.status).not.toBe('invalid');
        if (english.status === 'invalid' || spanish.status === 'invalid') throw Error('Example invalid');
        expect(english.frame.observations.map(point => point.id)).toEqual(spanish.frame.observations.map(point => point.id));
        expect(english.frame.observations.map(point => point.value)).toEqual(spanish.frame.observations.map(point => point.value));
        expect(JSON.stringify(a)).toBe(source);
      }
      expect(relationshipCopy.en[family].data).toContain('null');
      expect(relationshipCopy.es[family].compatibility).toContain('64');
    }
  });

  it('restores tiny relations at their visible scale without rounding their source values to zero', () => {
    for (const family of families) {
      const source = relationshipExampleSpec(family, 'precision', 'en'), before = planChart(source, size);
      const visible = planChart(source, {...size, hiddenSeriesIds: ['large']});
      if (before.status === 'invalid' || visible.status === 'invalid') throw Error('Precision example invalid');
      const tiny = before.frame.observations.find(point => point.id.pointId === 'tiny-relation')!;
      expect(tiny.value).toBe(1e-15); expect(tiny.relationship?.geometryOmitted).toBe(true);
      const after = visible.frame.observations.find(point => point.id.pointId === 'tiny-relation')!;
      expect(after.hit).toBeDefined(); expect(after.value).toBe(1e-15);
      expect(relationshipNumber(tiny.value, value => value.toFixed(2))).toBe('1e-15');
      expect(planChart(source, {...size, hiddenSeriesIds: []})).toEqual(before);
    }
  });

  it('announces known incomplete incident totals without inventing direction for undirected charts', () => {
    for (const family of families) {
      const result = planChart(relationshipExampleSpec(family, 'missing', 'en'), size);
      if (result.status === 'invalid') throw Error('Missing example invalid');
      const node = result.frame.observations.find(point => point.id.pointId === 'c')!;
      expect(node.value).toBe(0); expect(node.incomplete).toBe(true);
      expect(relationshipPrimaryLabel(node, 'en')).toBe('Known incident total');
      const details = relationshipDetails(node, family, 'en', value => String(value));
      expect(details.some(detail => detail.value.includes('Incomplete'))).toBe(true);
      expect(details.some(detail => detail.label === 'Known incoming')).toBe(family === 'dependencywheel');
      const link = result.frame.observations.find(point => point.id.pointId === 'ab')!;
      expect(relationshipDetails(link, family, 'es', String)[0]?.label).toBe(family === 'dependencywheel' ? 'Origen' : 'Extremo A');
    }
  });

  it('keeps zero values and omitted positive geometry distinct in tooltip descriptions', () => {
    expect(relationshipNumber(0, value => value.toFixed(2))).toBe('0.00');
    const zero = {value: 0, relationship: {type: 'link' as const, from: 'a', to: 'b', fromLabel: 'A', toLabel: 'B', directed: false, geometryOmitted: true as const}};
    const positive = {...zero, value: Number.MIN_VALUE};
    expect(relationshipDetails(zero, 'chord', 'en', String).at(-1)?.value).toContain('Zero');
    expect(relationshipDetails(positive, 'chord', 'en', String).at(-1)?.value).toContain('precision');
    expect(relationshipNumber(positive.value, () => '0.00')).not.toBe('0.00');
  });
});
