import {expect, it} from 'vitest';
import {planChart, prepareWordCloudMeasurements, type PlanSeries, type PlanSpec, type PlanWordCloudSpec} from '../../src/plan.js';

const size = {width: 390, height: 320}, fontKey = 'opaque-cache-key-not-a-font-family';
const source: PlanWordCloudSpec = {family: 'wordcloud', title: 'Source terms', words: [{id: 'original', text: '<script>not markup</script> & source', weight: 9}]};

it('exports the defensive preparation API and explicit geometric text role through the public entry', () => {
  const prepared = prepareWordCloudMeasurements(source, {...size, fontKey});
  expect(prepared.status).toBe('ok');
  if (prepared.status === 'invalid') throw Error(prepared.diagnostic.reason);
  expect(Object.isFrozen(prepared.preparation.requests)).toBe(true);
  expect(prepared.preparation.requests[0]?.text).toBe(source.words[0]!.text);
  expect(planChart(source, size)).toMatchObject({status: 'invalid', diagnostic: {reason: 'TEXT_MEASUREMENTS_REQUIRED'}});
  // Supplied rectangle fixture, not a measurement or approximation of this text.
  const measurements = prepared.preparation.requests.map(request => ({...request, width: 80, height: 20}));
  const result = planChart(source, {...size, wordcloudText: {fontKey, measurements}});
  if (result.status === 'invalid') throw Error(result.diagnostic.reason);
  const series: PlanSeries = result.frame.series[0]!;
  expect(series.textGlyphs?.[0]).toMatchObject({pointId: 'original', text: source.words[0]!.text, fontKey, rotation: 0, measured: {width: 80, height: 20}});
  expect(result.frame.observations[0]?.id).toEqual({seriesId: 'words', pointId: 'original'});
  expect(result.frame.wordcloudData?.[0]?.weight).toBe(9);
});

it('rejects the renderer-only measurement port on ordinary and relationship chart families', () => {
  const examples: readonly PlanSpec[] = [
    {family: 'line', title: 'Measured', axes: {x: {type: 'linear'}, y: {type: 'linear'}}, series: [{id: 's', name: 'Source', data: [{id: 'p', x: 0, y: 1}]}]},
    {family: 'dependencywheel', title: 'Relations', nodes: [{id: 'a', label: 'A'}], links: []},
  ];
  for (const spec of examples) expect(planChart(spec, {...size, wordcloudText: {fontKey, measurements: []}})).toMatchObject({status: 'invalid', diagnostic: {reason: 'UNSUPPORTED_TEXT_MEASUREMENTS', path: 'options.wordcloudText'}});
});

it('distinguishes positive words that do not fit from an absent source in the public frame', () => {
  const prepared = prepareWordCloudMeasurements(source, {...size, fontKey});
  if (prepared.status === 'invalid') throw Error(prepared.diagnostic.reason);
  const result = planChart(source, {...size, wordcloudText: {fontKey, measurements: prepared.preparation.requests.map(request => ({...request, width: 1000, height: 1000}))}});
  expect(result).toMatchObject({status: 'empty', frame: {wordcloudLayout: {sourceWords: 1, emptyReason: 'noSpace', attempts: 0}, wordcloudData: [{weight: 9, decision: {type: 'notDisplayed', reason: 'noSpace'}}], observations: []}});
});
