import {describe, expect, it} from 'vitest';
import {planChart} from '../../src/plan.js';
import {comparisonCopy, comparisonExampleSpec, comparisonExamples} from '../fixtures/comparison/comparison-examples.js';
import {comparisonDetails, comparisonNumber, comparisonPrimaryLabel} from '../fixtures/comparison/comparison-format.js';

describe('comparison showcase preparation', () => {
  it('plans all twelve bilingual variants without changing original point IDs', () => {
    for (const locale of ['en', 'es'] as const) {
      for (const example of comparisonExamples.bullet) {
        const spec = comparisonExampleSpec('bullet', example.id, locale), result = planChart(spec, {width: 360, height: 280});
        expect(result.status).not.toBe('invalid');
        if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
        expect(result.frame.bulletData?.map(point => point.id)).toEqual(spec.series.flatMap(series => series.data.map(point => ({seriesId: series.id, pointId: point.id}))));
      }
      for (const example of comparisonExamples.variwide) {
        const spec = comparisonExampleSpec('variwide', example.id, locale), result = planChart(spec, {width: 360, height: 280});
        expect(result.status).not.toBe('invalid');
        if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
        expect(result.frame.variwideData?.map(point => point.id)).toEqual(spec.series.flatMap(series => series.data.map(point => ({seriesId: series.id, pointId: point.id}))));
      }
    }
  });

  it('keeps identities across locales and describes current compatibility honestly', () => {
    for (const example of comparisonExamples.bullet) {
      const a = comparisonExampleSpec('bullet', example.id, 'en'), b = comparisonExampleSpec('bullet', example.id, 'es');
      expect(a.series.flatMap(series => series.data.map(point => point.id))).toEqual(b.series.flatMap(series => series.data.map(point => point.id)));
    }
    expect(comparisonCopy.en.variwide.options).toContain('One measured series');
    expect(comparisonCopy.en.variwide.options).toContain('weighted X zoom');
  });

  it('distinguishes zero, null and absent targets in tooltip details', () => {
    const format = (n: number) => String(n);
    expect(comparisonDetails({bullet: {kind: 'measure', measure: 0, target: 0}}, 'es', format)).toEqual([{label: 'Objetivo', value: '0'}]);
    expect(comparisonDetails({bullet: {kind: 'measure', measure: 4, target: null}}, 'en', format)).toEqual([{label: 'Target', value: 'Unknown'}]);
    expect(comparisonDetails({bullet: {kind: 'measure', measure: 4}}, 'en', format)).toEqual([]);
    expect(comparisonPrimaryLabel({bullet: {kind: 'target', measure: null, target: 0}}, 'es')).toBe('Objetivo');
    expect(comparisonDetails({bullet: {kind: 'target', measure: null, target: 0}}, 'en', format)).toEqual([{label: 'Measure', value: 'Unknown'}]);
  });

  it('does not announce a tiny positive source width as zero', () => {
    const fixed = (n: number) => n.toFixed(2);
    expect(comparisonNumber(Number.MIN_VALUE, fixed)).toMatch(/e-324$/);
    expect(comparisonNumber(.0001, fixed)).toBe('1e-4');
    expect(comparisonNumber(-.0001, fixed)).toBe('-1e-4');
    expect(comparisonDetails({variwide: {z: Number.MIN_VALUE, share: 0, zeroWidth: false, geometryOmitted: true}}, 'en', fixed)).toEqual([
      {label: 'Source width', value: comparisonNumber(Number.MIN_VALUE, fixed)},
      {label: 'Width share', value: 'Below representable precision'},
      {label: 'Representation', value: 'Precision-limit marker'},
    ]);
    expect(comparisonDetails({variwide: {z: 0, share: 0, zeroWidth: true, geometryOmitted: true}}, 'es', String)).toEqual([
      {label: 'Ancho original', value: '0'}, {label: 'Proporción del ancho', value: '0%'}, {label: 'Representación', value: 'Marcador de ancho cero'},
    ]);
  });
});
