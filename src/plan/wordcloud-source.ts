import {array, choice, fail, number, record, text, ValidationFailure} from '../internal/data/validation.js';
import {defaultPalette} from '../internal/chart/presentation.js';
import {freezePlan, ownPlanInput} from './input.js';
import type {PlanWordCloudMeasurementRequest, PlanWordCloudPrepareOptions, PlanWordCloudPreparedSummary, PlanWordCloudPrepareResult, PlanWordCloudRotation, PlanWordCloudSpec} from '../public/wordcloud-types.js';

export const MAX_WORDCLOUD_SOURCE = 2048;
export const MAX_WORDCLOUD_GLYPHS = 128;
export interface OwnedWord {readonly id: string; readonly text: string; readonly weight: number | null; readonly groupId: string;}
export interface OwnedWordCloud {
  readonly title: string; readonly description: string; readonly words: readonly OwnedWord[];
  readonly groups: readonly Readonly<{id: string; label: string; color: string}>[];
  readonly minFontSize: number; readonly maxFontSize: number; readonly padding: number;
  readonly rotations: readonly PlanWordCloudRotation[]; readonly seed: number; readonly maxWords: number;
}
export interface WordCloudContext {readonly width: number; readonly height: number; readonly fontKey: string; readonly hidden: ReadonlySet<string>;}
export interface WordCloudSelection {
  readonly source: OwnedWordCloud; readonly context: WordCloudContext;
  readonly selected: readonly Readonly<{word: OwnedWord; fontSize: number}>[];
  readonly summaries: readonly PlanWordCloudPreparedSummary[];
  readonly requests: readonly PlanWordCloudMeasurementRequest[];
}
const nonBlank = (value: unknown, path: string, maximum: number) => {
  const result = text(value, path, maximum); if (!result.trim()) fail(path, 'EMPTY_TEXT'); return result;
};
export function wordCloudSource(input: unknown): OwnedWordCloud {
  const raw = record(input, ['family', 'title', 'description', 'words', 'groups', 'minFontSize', 'maxFontSize', 'padding', 'rotations', 'seed', 'maxWords'], ['family', 'title', 'words'], 'spec');
  choice(raw.family, ['wordcloud'], 'spec.family');
  const title = text(raw.title, 'spec.title', 512, true), description = raw.description === undefined ? '' : text(raw.description, 'spec.description', 4096, true);
  const groupMap = new Map<string, {id: string; label: string}>();
  for (const [index, item] of array(raw.groups === undefined ? [] : raw.groups, 15, 'spec.groups').entries()) {
    const at = `spec.groups[${index}]`, group = record(item, ['id', 'label'], ['id', 'label'], at), id = text(group.id, at + '.id', 128);
    if (groupMap.has(id)) fail(at + '.id', 'DUPLICATE_ID');
    groupMap.set(id, {id, label: text(group.label, at + '.label', 256)});
  }
  const ids = new Set<string>();
  const words = array(raw.words, MAX_WORDCLOUD_SOURCE, 'spec.words').map((item, index): OwnedWord => {
    const at = `spec.words[${index}]`, word = record(item, ['id', 'text', 'weight', 'groupId'], ['id', 'text', 'weight'], at);
    const id = text(word.id, at + '.id', 128); if (ids.has(id)) fail(at + '.id', 'DUPLICATE_ID'); ids.add(id);
    const groupId = word.groupId === undefined ? 'words' : text(word.groupId, at + '.groupId', 128);
    if (!groupMap.has(groupId)) {
      if (groupId !== 'words') fail(at + '.groupId', 'UNKNOWN_GROUP_ID');
      groupMap.set('words', {id: 'words', label: title});
    }
    return {id, text: nonBlank(word.text, at + '.text', 512), weight: word.weight === null ? null : number(word.weight, at + '.weight', 0), groupId};
  });
  const minFontSize = raw.minFontSize === undefined ? 12 : number(raw.minFontSize, 'spec.minFontSize', 4, 512);
  const maxFontSize = raw.maxFontSize === undefined ? 48 : number(raw.maxFontSize, 'spec.maxFontSize', 4, 512);
  if (minFontSize > maxFontSize) fail('spec.maxFontSize', 'REVERSED_FONT_RANGE');
  const rotations = array(raw.rotations === undefined ? [0] : raw.rotations, 2, 'spec.rotations').map((rotation, i) => choice(rotation, [0, 90] as const, `spec.rotations[${i}]`));
  if (!rotations.length || new Set(rotations).size !== rotations.length) fail('spec.rotations', 'BAD_ROTATIONS');
  const seed = raw.seed === undefined ? 0 : number(raw.seed, 'spec.seed', 0, 0xffffffff);
  const maxWords = raw.maxWords === undefined ? 64 : number(raw.maxWords, 'spec.maxWords', 1, MAX_WORDCLOUD_GLYPHS);
  if (!Number.isInteger(seed)) fail('spec.seed', 'EXPECTED_INTEGER');
  if (!Number.isInteger(maxWords)) fail('spec.maxWords', 'EXPECTED_INTEGER');
  const palette = defaultPalette('light', false).series;
  return {title, description, words, groups: [...groupMap.values()].map((group, i) => ({...group, color: palette[i % palette.length]!})),
    minFontSize, maxFontSize, rotations, seed, maxWords, padding: raw.padding === undefined ? 2 : number(raw.padding, 'spec.padding', 0, 16)};
}
export function wordCloudContext(input: unknown, source: OwnedWordCloud): WordCloudContext {
  const raw = record(input, ['width', 'height', 'hiddenSeriesIds', 'fontKey'], ['width', 'height', 'fontKey'], 'options');
  const width = number(raw.width, 'options.width', 64, 10000), height = number(raw.height, 'options.height', 64, 10000);
  const fontKey = nonBlank(raw.fontKey, 'options.fontKey', 512), groups = new Set(source.groups.map(group => group.id)), hidden = new Set<string>();
  for (const [index, value] of array(raw.hiddenSeriesIds === undefined ? [] : raw.hiddenSeriesIds, 16, 'options.hiddenSeriesIds').entries()) {
    const at = `options.hiddenSeriesIds[${index}]`, id = text(value, at, 128);
    if (!groups.has(id)) fail(at, 'UNKNOWN_SERIES');
    if (hidden.has(id)) fail(at, 'DUPLICATE_ID'); hidden.add(id);
  }
  return {width, height, fontKey, hidden};
}
export function selectWordCloud(source: OwnedWordCloud, context: WordCloudContext): WordCloudSelection {
  const eligible = source.words.filter((word): word is OwnedWord & Readonly<{weight: number}> => word.weight !== null && word.weight > 0 && !context.hidden.has(word.groupId));
  eligible.sort((a, b) => a.weight === b.weight ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0 : a.weight > b.weight ? -1 : 1);
  const largest = eligible[0]?.weight ?? 0;
  const selected = eligible.slice(0, source.maxWords).map(word => ({word, fontSize: Math.max(source.minFontSize, Math.min(source.maxFontSize, Math.round((source.minFontSize + (source.maxFontSize - source.minFontSize) * Math.sqrt(word.weight / largest)) * 4) / 4))}));
  const sizes = new Map(selected.map(item => [item.word.id, item.fontSize]));
  const summaries: PlanWordCloudPreparedSummary[] = source.words.map(word => {
    const size = sizes.get(word.id);
    const decision: PlanWordCloudPreparedSummary['decision'] = size !== undefined ? {type: 'measurementPending', fontSize: size}
      : {type: 'notDisplayed', reason: context.hidden.has(word.groupId) ? 'hidden' : word.weight === null ? 'unknown' : word.weight === 0 ? 'zero' : 'budget'};
    return {id: {seriesId: word.groupId, pointId: word.id}, text: word.text, weight: word.weight, decision};
  });
  return {source, context, selected, summaries, requests: selected.map(({word, fontSize}) => ({wordId: word.id, text: word.text, fontSize, fontKey: context.fontKey}))};
}
export function prepareWordCloudMeasurements(spec: PlanWordCloudSpec, options: PlanWordCloudPrepareOptions): PlanWordCloudPrepareResult {
  let path: 'spec' | 'options' = 'spec';
  try {
    const source = wordCloudSource(ownPlanInput(spec)); path = 'options';
    const context = wordCloudContext(ownPlanInput(options), source), selection = selectWordCloud(source, context);
    return freezePlan({status: 'ok', preparation: {requests: selection.requests, source: selection.summaries,
      legend: source.groups.map(group => ({id: group.id, name: group.label, color: group.color, visible: !context.hidden.has(group.id)}))}});
  } catch (error) {return invalidWordCloud(error, path);}
}
export function invalidWordCloud(error: unknown, path = 'spec'): Readonly<{status: 'invalid'; diagnostic: import('../public/chart-types.js').ChartDiagnostic}> {
  return error instanceof ValidationFailure ? {status: 'invalid', diagnostic: error.diagnostic}
    : {status: 'invalid', diagnostic: {code: 'INVALID_CONFIG', reason: error instanceof Error && ['INPUT_LIMIT', 'BAD_JSON', 'BAD_ARRAY', 'ACCESSOR'].includes(error.message) ? error.message : 'BAD_SPEC', path, message: 'Invalid bounded planning input'}};
}
