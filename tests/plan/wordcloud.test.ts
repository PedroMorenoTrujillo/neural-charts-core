import {describe, expect, it} from 'vitest';
import fc from 'fast-check';
import {planWordCloud} from '../../src/plan/wordcloud.js';
import {prepareWordCloudMeasurements, MAX_WORDCLOUD_GLYPHS, MAX_WORDCLOUD_SOURCE} from '../../src/plan/wordcloud-source.js';
import {MAX_WORDCLOUD_ATTEMPTS} from '../../src/plan/wordcloud-packing.js';
import type {PlanWordCloudBounds, PlanWordCloudMeasurement, PlanWordCloudOptions, PlanWordCloudPrepareOptions, PlanWordCloudResult, PlanWordCloudSpec} from '../../src/public/wordcloud-types.js';

const size = {width: 390, height: 320}, fontKey = 'synthetic-rectangle-fixture-not-font-metrics';
const source = (count = 8): PlanWordCloudSpec => ({family: 'wordcloud', title: 'Measured words', words: Array.from({length: count}, (_, i) => ({id: 'w' + i, text: 'Word ' + i, weight: count - i}))});
function prepare(spec = source(), options: Partial<PlanWordCloudPrepareOptions> = {}) {
  const result = prepareWordCloudMeasurements(spec, {...size, fontKey, ...options});
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic)); return result.preparation;
}
// These are arbitrary supplied boxes. They do not measure or approximate a font.
function measurements(spec = source(), bounds: (wordId: string) => Readonly<{width: number; height: number}> = () => ({width: 40, height: 18}), options: Partial<PlanWordCloudPrepareOptions> = {}): readonly PlanWordCloudMeasurement[] {
  return prepare(spec, options).requests.map(request => {const box = bounds(request.wordId); return {...request, width: box.width, height: box.height};});
}
function frame(result: PlanWordCloudResult) {if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic)); return result.frame;}
const planned = (spec = source(), items = measurements(spec), options: Partial<PlanWordCloudOptions> = {}) => planWordCloud(spec, {...size, wordcloudText: {fontKey, measurements: items}, ...options});
const intersects = (a: PlanWordCloudBounds, b: PlanWordCloudBounds) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe('real-measurement WordCloud port', () => {
  it('requests only bounded positive words and retains all2048 original values and identities', () => {
    const spec = source(MAX_WORDCLOUD_SOURCE), result = prepare(spec);
    expect(result.requests).toHaveLength(64); expect(result.source).toHaveLength(2048);
    expect(result.source.map(row => row.id.pointId)).toEqual(spec.words.map(word => word.id));
    expect(result.source.filter(row => row.decision.kind === 'notDisplayed' && row.decision.reason === 'budget')).toHaveLength(1984);
    expect(prepare({...spec, maxWords: 128}).requests).toHaveLength(MAX_WORDCLOUD_GLYPHS);
  });
  it('does not infer dimensions from text length or manufacture a fallback when metrics are absent', () => {
    expect(planWordCloud(source(), size)).toMatchObject({status: 'invalid', diagnostic: {reason: 'TEXT_MEASUREMENTS_REQUIRED'}});
    expect(planWordCloud(source(), {...size, wordcloudText: {fontKey}})).toMatchObject({status: 'invalid', diagnostic: {reason: 'TEXT_MEASUREMENTS_REQUIRED'}});
    const spec = {...source(1), words: [{id: 'short', text: 'A', weight: 1}]};
    const f = frame(planned(spec, measurements(spec, () => ({width: 210, height: 20}))));
    expect(f.series[0]?.textGlyphs[0]?.measured.width).toBe(210);
    expect(f.series[0]?.textGlyphs[0]?.bounds.width).toBe(210);
  });
  it('requires exact ID/text/font-size/font-key matches and complete unambiguous measurements', () => {
    const spec = source(2), items = measurements(spec), first = items[0]!;
    for (const changed of [{...first, text: 'Stale'}, {...first, fontSize: first.fontSize + .25}, {...first, fontKey: 'old-font'}, {...first, wordId: 'unknown'}]) expect(planned(spec, [changed, items[1]!]).status).toBe('invalid');
    expect(planned(spec, [first, first])).toMatchObject({status: 'invalid', diagnostic: {reason: 'DUPLICATE_ID'}});
    expect(planned(spec, [first])).toMatchObject({status: 'invalid', diagnostic: {reason: 'TEXT_MEASUREMENTS_REQUIRED'}});
    expect(planned(spec, [...items, {...first, wordId: 'extra'}])).toMatchObject({status: 'invalid', diagnostic: {reason: 'UNEXPECTED_TEXT_MEASUREMENT'}});
    for (const value of [NaN, Infinity, -1, 1000001]) expect(planned(spec, [{...first, width: value}, items[1]!]).status).toBe('invalid');
    expect(planned(spec, [...items].reverse())).toEqual(planned(spec, items));
    expect(planned(spec, items, {wordcloudText: {fontKey: 'new-font-revision', measurements: items}})).toMatchObject({status: 'invalid', diagnostic: {reason: 'STALE_TEXT_MEASUREMENT'}});
  });
  it('keeps logical measured size and center/rotation/bounds explicit without scaling below the chosen font', () => {
    const spec = {...source(1), rotations: [90] as const, minFontSize: 28, maxFontSize: 28};
    const f = frame(planned(spec, measurements(spec, () => ({width: 100, height: 25}))));
    const glyph = f.series[0]!.textGlyphs[0]!;
    expect(glyph.fontSize).toBe(28); expect(glyph.rotation).toBe(90);
    expect(glyph.measured).toEqual({width: 100, height: 25});
    expect(glyph.bounds).toMatchObject({width: 25, height: 100});
    expect(glyph.center).toEqual({x: glyph.bounds.x + 12.5, y: glyph.bounds.y + 50});
    expect(f.observations[0]?.hit?.kind).toBe('polygon');
  });
  it('distinguishes unknown, known zero, no ink, no space and an empty source', () => {
    const spec: PlanWordCloudSpec = {...source(), words: [{id: 'null', text: 'Unknown', weight: null}, {id: 'zero', text: 'Zero', weight: 0}, {id: 'inkless', text: '\u200d', weight: 1}, {id: 'oversized', text: 'Wide', weight: 2}]};
    const f = frame(planned(spec, measurements(spec, id => id === 'inkless' ? {width: 0, height: 10} : {width: 1000, height: 20})));
    expect(f.wordcloudData.map(row => row.weight)).toEqual([null, 0, 1, 2]);
    expect(f.wordcloudData.map(row => row.decision)).toEqual([{kind: 'notDisplayed', reason: 'unknown'}, {kind: 'notDisplayed', reason: 'zero'}, {kind: 'notDisplayed', reason: 'noInk'}, {kind: 'notDisplayed', reason: 'noSpace'}]);
    expect(f.observations).toHaveLength(0); expect(f.wordcloudLayout.emptyReason).toBe('noSpace');
    expect(f.wordcloudLayout.notDisplayed).toEqual({unknown: 1, zero: 1, noInk: 1, noSpace: 1, hidden: 0, budget: 0});
    expect(f.wordcloudLayout.attempts).toBe(0);
    expect(frame(planned(source(0))).wordcloudLayout.emptyReason).toBe('noSource');
    const zeros = {...source(1), words: [{id: 'z', text: 'Known zero', weight: 0}]};
    expect(frame(planned(zeros)).wordcloudLayout.emptyReason).toBe('noEligibleWords');
    expect(frame(planned(source(1), measurements(source(1), () => ({width: 0, height: 0})))).wordcloudLayout.emptyReason).toBe('noInk');
  });
  it('uses stable ID ties and produces the same poses after source reordering', () => {
    const spec = {...source(12), words: source(12).words.map(word => ({...word, weight: 1})), rotations: [0, 90] as const, seed: 19};
    const reversed = {...spec, words: [...spec.words].reverse()}, a = frame(planned(spec)), b = frame(planned(reversed));
    expect(a.series).toEqual(b.series); expect(a.observations).toEqual(b.observations);
    expect(planned(spec)).toEqual(planned(spec));
    expect(a.wordcloudData.map(row => row.id.pointId)).toEqual(spec.words.map(word => word.id));
  });
  it('preserves finite extreme weights, never sums them to overflow and keeps minimum font size truthful', () => {
    const spec = {...source(3), minFontSize: 4.1, words: [{id: 'max', text: 'Maximum', weight: Number.MAX_VALUE}, {id: 'large', text: 'Large', weight: 1e308}, {id: 'tiny', text: 'Tiny', weight: Number.MIN_VALUE}]};
    const p = prepare(spec); expect(p.requests.every(request => request.fontSize >= 4.1 && request.fontSize <= 48)).toBe(true);
    expect(p.requests.find(request => request.wordId === 'tiny')?.fontSize).toBe(4.1);
    const f = frame(planned(spec)); expect(f.wordcloudData.map(row => row.weight)).toEqual(spec.words.map(word => word.weight));
  });
  it('hides source groups before selection, restores exact geometry, and keeps original invalid data invalid', () => {
    const spec = {...source(3), groups: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], words: [{id: 'a1', text: 'A', weight: 9, groupId: 'a'}, {id: 'b1', text: 'B', weight: 1, groupId: 'b'}, {id: 'b2', text: 'C', weight: 2, groupId: 'b'}]};
    const hidden = {hiddenSeriesIds: ['a']}, p = prepare(spec, hidden);
    expect(p.requests.map(request => request.wordId)).toEqual(['b2', 'b1']);
    const result = frame(planned(spec, measurements(spec, undefined, hidden), hidden));
    expect(result.legend).toMatchObject([{id: 'a', visible: false}, {id: 'b', visible: true}]);
    expect(result.wordcloudData[0]?.decision).toEqual({kind: 'notDisplayed', reason: 'hidden'});
    expect(planned(spec)).toEqual(planned(spec, measurements(spec), {hiddenSeriesIds: []}));
    expect(prepareWordCloudMeasurements({...spec, words: [{id: 'bad', text: 'Bad', weight: -1, groupId: 'a'}]}, {...size, fontKey, hiddenSeriesIds: ['a']}).status).toBe('invalid');
    expect(prepareWordCloudMeasurements(spec, {...size, fontKey, hiddenSeriesIds: ['missing']})).toMatchObject({status: 'invalid'});
  });
  it('bounds crowded packing globally and reports positive source words that cannot fit', () => {
    const spec = {...source(128), maxWords: 128, rotations: [0, 90] as const, padding: 0};
    const items = measurements(spec, () => ({width: 50, height: 40}), {width: 64, height: 64});
    const f = frame(planned(spec, items, {width: 64, height: 64}));
    expect(f.wordcloudLayout.attempts).toBeLessThanOrEqual(MAX_WORDCLOUD_ATTEMPTS);
    expect(f.wordcloudLayout.budgetExhausted).toBe(true);
    expect(f.wordcloudLayout.notDisplayed.noSpace).toBeGreaterThan(0);
    expect(f.wordcloudData).toHaveLength(128); expect(f.wordcloudLayout.displayedWords).toBe(1);
    expect(f.wordcloudData.filter(row => row.decision.kind === 'displayed').map(row => row.id)).toEqual(f.observations.map(row => row.id));
  });
  it('rejects unknown style fields, IDs, invalid budgets and unsupported capabilities', () => {
    for (const patch of [{maxWords: 129}, {maxWords: 1.5}, {seed: -1}, {seed: .5}, {rotations: []}, {rotations: [45]}, {rotations: [0, 0]}, {minFontSize: 49, maxFontSize: 48}]) expect(prepareWordCloudMeasurements({...source(), ...patch} as PlanWordCloudSpec, {...size, fontKey}).status).toBe('invalid');
    expect(prepareWordCloudMeasurements(source(2049), {...size, fontKey})).toMatchObject({status: 'invalid'});
    expect(prepareWordCloudMeasurements({...source(), words: [{id: 'x', text: ' ', weight: 1}]}, {...size, fontKey})).toMatchObject({status: 'invalid'});
    expect(prepareWordCloudMeasurements({...source(), words: [source().words[0]!, source().words[0]!]}, {...size, fontKey})).toMatchObject({status: 'invalid', diagnostic: {reason: 'DUPLICATE_ID'}});
    for (const options of [{viewport: {axes: 'xy' as const}}, {references: []}, {stacking: 'sum' as const}]) expect(planned(source(), measurements(), options).status).toBe('invalid');
  });
  it('does not silently treat null optional arrays as defaults', () => {
    for (const patch of [{groups: null}, {rotations: null}]) expect(prepareWordCloudMeasurements({...source(), ...patch} as unknown as PlanWordCloudSpec, {...size, fontKey}).status).toBe('invalid');
    expect(prepareWordCloudMeasurements(source(), {...size, fontKey, hiddenSeriesIds: null} as unknown as PlanWordCloudPrepareOptions).status).toBe('invalid');
    expect(planWordCloud(source(0), {...size, wordcloudText: {fontKey, measurements: null}} as unknown as PlanWordCloudOptions).status).toBe('invalid');
  });
  it('owns snapshots and never executes source or measurement getters', () => {
    let reads = 0; const spec = source(1), first = spec.words[0]!;
    const unsafe = Object.defineProperty({...first}, 'weight', {enumerable: true, get() {reads++; return 1;}});
    expect(prepareWordCloudMeasurements({...spec, words: [unsafe]}, {...size, fontKey}).status).toBe('invalid');
    const items = measurements(spec), metric = Object.defineProperty({...items[0]}, 'width', {enumerable: true, get() {reads++; return 1;}});
    expect(planned(spec, [metric]).status).toBe('invalid'); expect(reads).toBe(0);
    const result = frame(planned(spec, items)), snapshot = JSON.stringify(result);
    Object.assign(first, {text: 'Changed', weight: 999}); Object.assign(items[0]!, {width: 999});
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(Object.isFrozen(result.series[0]?.textGlyphs[0]?.bounds)).toBe(true);
    expect(Object.isFrozen(first)).toBe(false);
  });
  it('applies the shared bounded JSON snapshot to both public preparation arguments', () => {
    const huge = {...source(2048), words: source(2048).words.map(word => ({...word, text: 'x'.repeat(512)}))};
    expect(prepareWordCloudMeasurements(huge, {...size, fontKey})).toMatchObject({status: 'invalid', diagnostic: {reason: 'INPUT_LIMIT', path: 'spec'}});
    expect(prepareWordCloudMeasurements(source(), {...size, fontKey: 'x'.repeat(1000001)})).toMatchObject({status: 'invalid', diagnostic: {reason: 'INPUT_LIMIT', path: 'options'}});
    const options = Object.defineProperty({...size}, 'fontKey', {enumerable: true, get() {throw Error('must not execute');}});
    expect(prepareWordCloudMeasurements(source(), options as PlanWordCloudPrepareOptions)).toMatchObject({status: 'invalid', diagnostic: {reason: 'ACCESSOR', path: 'options'}});
  });
  it('retains Unicode, long text and prototype-shaped IDs without truncation or aliasing', () => {
    const text = '📊 تحليل البيانات – datos '.repeat(10), spec: PlanWordCloudSpec = {...source(), words: [{id: '__proto__', text, weight: 3}, {id: 'constructor', text: 'Neural', weight: 2}]};
    const p = prepare(spec); expect(p.requests.find(request => request.wordId === '__proto__')?.text).toBe(text);
    const f = frame(planned(spec)); expect(f.wordcloudData[0]?.text).toBe(text);
    expect(f.observations.map(row => row.id.pointId).sort()).toEqual(['__proto__', 'constructor']);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });
  it('reuses matching logical measurements across resize while preserving truthful glyph sizes', () => {
    const spec = source(2), items = measurements(spec), a = frame(planned(spec, items)), b = frame(planned(spec, items, {width: 768, height: 600}));
    expect(a.series.flatMap(series => series.textGlyphs).map(glyph => glyph.fontSize)).toEqual(b.series.flatMap(series => series.textGlyphs).map(glyph => glyph.fontSize));
    expect(b.observations.map(row => row.id)).toEqual(a.observations.map(row => row.id));
    expect(a.series[0]?.textGlyphs[0]?.center).not.toEqual(b.series[0]?.textGlyphs[0]?.center);
  });
  it('keeps supplied rectangles disjoint and inside the viewport across bounded randomized workloads', () => {
    fc.assert(fc.property(fc.array(fc.record({width: fc.integer({min: 2, max: 120}), height: fc.integer({min: 5, max: 45}), weight: fc.integer({min: 1, max: 100})}), {minLength: 1, maxLength: 20}), fc.integer({min: 0, max: 0xffffffff}), (boxes, seed) => {
      const spec = {...source(boxes.length), seed, rotations: [0, 90] as const, words: boxes.map((box, i) => ({id: 'w' + i, text: 'Box ' + i, weight: box.weight}))};
      const dims = new Map(boxes.map((box, i) => ['w' + i, box]));
      const f = frame(planned(spec, measurements(spec, id => dims.get(id)!))), glyphs = f.series.flatMap(series => series.textGlyphs);
      for (let i = 0; i < glyphs.length; i++) {
        const b = glyphs[i]!.bounds; expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= size.width && b.y + b.height <= size.height).toBe(true);
        for (let j = 0; j < i; j++) expect(intersects(b, glyphs[j]!.bounds)).toBe(false);
      }
      expect(f.wordcloudLayout.attempts).toBeLessThanOrEqual(MAX_WORDCLOUD_ATTEMPTS);
      expect(f.observations.map(row => row.id.pointId).sort()).toEqual(glyphs.map(glyph => glyph.pointId).sort());
    }), {seed: 20261101, numRuns: 32});
  });
});
