import {array, fail, number, record, text} from '../internal/data/validation.js';
import {freezePlan} from './input.js';
import type {PlanObservation} from '../public/plan-types.js';
import type {PlanWordCloudDecision, PlanWordCloudLayout, PlanWordCloudMeasurement, PlanWordCloudNotDisplayedReason, PlanWordCloudOptions, PlanWordCloudResult, PlanWordCloudSeries, PlanWordCloudSpec, PlanWordCloudSummary} from '../public/wordcloud-types.js';
import {MAX_WORDCLOUD_GLYPHS, invalidWordCloud, selectWordCloud, wordCloudContext, wordCloudSource, type WordCloudSelection} from './wordcloud-source.js';
import {packWordCloud} from './wordcloud-packing.js';

function measurementsFor(selection: WordCloudSelection, value: unknown): ReadonlyMap<string, PlanWordCloudMeasurement> {
  const expected = new Map(selection.requests.map(request => [request.wordId, request]));
  if (value === undefined && expected.size) fail('options.wordcloudText.measurements', 'TEXT_MEASUREMENTS_REQUIRED');
  const result = new Map<string, PlanWordCloudMeasurement>();
  for (const [index, item] of array(value === undefined ? [] : value, MAX_WORDCLOUD_GLYPHS, 'options.wordcloudText.measurements').entries()) {
    const at = `options.wordcloudText.measurements[${index}]`, raw = record(item, ['wordId', 'text', 'fontSize', 'fontKey', 'width', 'height'], ['wordId', 'text', 'fontSize', 'fontKey', 'width', 'height'], at);
    const wordId = text(raw.wordId, at + '.wordId', 128), request = expected.get(wordId);
    if (result.has(wordId)) fail(at + '.wordId', 'DUPLICATE_ID');
    if (!request) fail(at + '.wordId', 'UNEXPECTED_TEXT_MEASUREMENT');
    const fontSize = number(raw.fontSize, at + '.fontSize', 4, 512), fontKey = text(raw.fontKey, at + '.fontKey', 512), label = text(raw.text, at + '.text', 512);
    if (fontKey !== request.fontKey || fontSize !== request.fontSize || label !== request.text) fail(at, 'STALE_TEXT_MEASUREMENT');
    result.set(wordId, {wordId, text: label, fontSize, fontKey, width: number(raw.width, at + '.width', 0, 1000000), height: number(raw.height, at + '.height', 0, 1000000)});
  }
  if (result.size !== expected.size) fail('options.wordcloudText.measurements', 'TEXT_MEASUREMENTS_REQUIRED');
  return result;
}

/** Requires actual renderer measurements; absent metrics never become guessed glyphs. */
export function planWordCloud(spec: PlanWordCloudSpec, inputOptions: PlanWordCloudOptions): PlanWordCloudResult {
  try {
    const source = wordCloudSource(spec);
    const raw = record(inputOptions, ['width', 'height', 'hiddenSeriesIds', 'wordcloudText', 'stacking', 'viewport', 'references'], ['width', 'height'], 'options');
    for (const key of ['stacking', 'viewport', 'references']) if (Object.hasOwn(raw, key)) fail('options.' + key, 'UNSUPPORTED_LAYOUT_OPTION');
    if (raw.wordcloudText === undefined) fail('options.wordcloudText', 'TEXT_MEASUREMENTS_REQUIRED');
    const textInput = record(raw.wordcloudText, ['fontKey', 'measurements'], ['fontKey'], 'options.wordcloudText');
    const context = wordCloudContext({width: raw.width, height: raw.height, fontKey: textInput.fontKey, ...(raw.hiddenSeriesIds === undefined ? {} : {hiddenSeriesIds: raw.hiddenSeriesIds})}, source);
    const selection = selectWordCloud(source, context), measured = measurementsFor(selection, textInput.measurements);
    const packing = packWordCloud(selection.selected.map(({word}) => measured.get(word.id)!), {width: context.width, height: context.height, padding: source.padding, rotations: source.rotations, seed: source.seed});
    const observations: PlanObservation[] = [], series: PlanWordCloudSeries[] = [];
    const decisions = new Map<string, PlanWordCloudDecision>();
    for (const group of source.groups) {
      const textGlyphs: PlanWordCloudSeries['textGlyphs'][number][] = [];
      for (const {word, fontSize} of selection.selected) {
        if (word.groupId !== group.id) continue;
        const measurement = measured.get(word.id)!, pose = packing.placements.get(word.id);
        if (!pose) {decisions.set(word.id, {type: 'notDisplayed', reason: measurement.width === 0 || measurement.height === 0 ? 'noInk' : 'noSpace'}); continue;}
        const id = {seriesId: group.id, pointId: word.id}, b = pose.bounds;
        textGlyphs.push({pointId: word.id, text: word.text, fontSize, fontKey: context.fontKey, measured: {width: measurement.width, height: measurement.height}, ...pose, color: group.color});
        observations.push({id, label: word.text, seriesName: group.label, value: word.weight!, x: pose.center.x, y: pose.center.y, color: group.color,
          hit: {type: 'polygon', vertices: [{x: b.x, y: b.y}, {x: b.x + b.width, y: b.y}, {x: b.x + b.width, y: b.y + b.height}, {x: b.x, y: b.y + b.height}]}});
        decisions.set(word.id, {type: 'displayed', fontSize, rotation: pose.rotation});
      }
      if (textGlyphs.length) series.push({id: group.id, name: group.label, color: group.color, textGlyphs});
    }
    const summaries: PlanWordCloudSummary[] = selection.summaries.map(summary => ({id: summary.id, text: summary.text, weight: summary.weight,
      decision: summary.decision.type === 'measurementPending' ? decisions.get(summary.id.pointId)! : summary.decision}));
    const notDisplayed: Record<PlanWordCloudNotDisplayedReason, number> = {hidden: 0, unknown: 0, zero: 0, budget: 0, noInk: 0, noSpace: 0};
    for (const summary of summaries) if (summary.decision.type === 'notDisplayed') notDisplayed[summary.decision.reason]++;
    const emptyReason: PlanWordCloudLayout['emptyReason'] = observations.length ? undefined : source.words.length === 0 ? 'noSource'
      : selection.requests.length === 0 ? 'noEligibleWords' : notDisplayed.noSpace ? 'noSpace' : 'noInk';
    return freezePlan({status: observations.length ? 'ok' : 'empty', frame: {schema: 'nc-plan/1', family: 'wordcloud', width: context.width, height: context.height,
      title: source.title, description: source.description, unit: '', legend: source.groups.map(group => ({id: group.id, name: group.label, color: group.color, visible: !context.hidden.has(group.id)})),
      series, observations, grid: [], labels: [], wordcloudData: summaries,
      wordcloudLayout: {sourceWords: source.words.length, requestedWords: selection.requests.length, displayedWords: observations.length,
        attempts: packing.attempts, collisionChecks: packing.collisionChecks, budgetExhausted: packing.budgetExhausted, notDisplayed,
        ...(emptyReason === undefined ? {} : {emptyReason})}}});
  } catch (error) {return invalidWordCloud(error);}
}
