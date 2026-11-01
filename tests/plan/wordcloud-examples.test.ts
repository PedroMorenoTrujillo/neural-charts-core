import {describe, expect, it} from 'vitest';
import {prepareWordCloudMeasurements} from '../../src/plan/wordcloud-source.js';
import {planWordCloud} from '../../src/plan/wordcloud.js';
import {wordcloudCopy, wordcloudExamples, wordcloudExampleSpec} from '../fixtures/wordcloud/wordcloud-examples.js';
import {wordcloudSourceReason, wordcloudWeight} from '../fixtures/wordcloud/wordcloud-format.js';

describe('WordCloud bilingual showcase preparation', () => {
  it('plans eight bilingual variants from explicit synthetic boxes, without claiming font measurement', () => {
    const en = wordcloudExamples('en'), es = wordcloudExamples('es');
    expect(en).toHaveLength(8); expect(es.map(example => example.id)).toEqual(en.map(example => example.id));
    for (const example of en) for (const locale of ['en', 'es'] as const) {
      const spec = wordcloudExampleSpec(example.id, locale), snapshot = JSON.stringify(spec), options = {width: 390, height: 320, fontKey: 'synthetic-box-contract-only'};
      const p = prepareWordCloudMeasurements(spec, options);
      if (p.status === 'invalid') throw Error(JSON.stringify(p.diagnostic));
      const measurements = p.preparation.requests.map((request, i) => ({...request, width: 24 + i % 5 * 8, height: 18 + i % 3 * 2}));
      const result = planWordCloud(spec, {width: options.width, height: options.height, wordcloudText: {fontKey: options.fontKey, measurements}});
      expect(result.status, example.id + ':' + locale).not.toBe('invalid');
      if (result.status === 'invalid') throw Error('Example invalid');
      expect(result.frame.wordcloudData.map(row => row.id.pointId)).toEqual(spec.words.map(word => word.id));
      expect(result.frame.wordcloudData.map(row => row.weight)).toEqual(spec.words.map(word => word.weight));
      expect(JSON.stringify(spec)).toBe(snapshot);
    }
    expect(wordcloudCopy.en.data).toContain('null'); expect(wordcloudCopy.es.data).toContain('cero');
  });
  it('preserves source IDs across languages and explicitly labels omitted and tiny weights', () => {
    for (const example of wordcloudExamples('en')) expect(wordcloudExampleSpec(example.id, 'en').words.map(word => word.id)).toEqual(wordcloudExampleSpec(example.id, 'es').words.map(word => word.id));
    expect(wordcloudWeight(Number.MIN_VALUE, () => '0.00')).not.toBe('0.00');
    expect(wordcloudWeight(0, () => '0')).toBe('0');
    expect(wordcloudSourceReason('noSpace', 'en')).toContain('fit');
    expect(wordcloudSourceReason('unknown', 'es')).not.toBe(wordcloudSourceReason('zero', 'es'));
  });
});
