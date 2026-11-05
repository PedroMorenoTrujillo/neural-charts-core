import { expect, test } from 'vitest';
import { datumKey, selectionIndex, prepareSelection, toggleSelection, replaceSelection, selectionChanged } from '../../src/internal/interaction/selection.js';
const ids = [{ seriesId: 'one', pointId: 'a' }, { seriesId: 'two', pointId: 'a' }, { seriesId: 'one', pointId: 'b' }], known = selectionIndex(ids);
test('composite IDs preserve series scope, embedded separators and real radial identity', () => {
  expect(new Set([{ seriesId: 'a:b', pointId: 'c' }, { seriesId: 'a', pointId: 'b:c' }, { pointId: 'a:b:c' }, { pointId: 'a\0b' }, { pointId: 'ab' }].map(datumKey)).size).toBe(5);
});
test('internal single toggles, replaces and clears without mutating snapshots', () => {
  const prepared = prepareSelection({ mode: 'internal', initial: [ids[0]] }, known); expect(prepared.status).toBe('ok'); if (prepared.status !== 'ok' || !prepared.value) return;
  const before = JSON.stringify(prepared.value); expect(toggleSelection(prepared.value, ids[0]!)).toEqual({ status: 'ok', value: [] }); expect(toggleSelection(prepared.value, ids[1]!)).toEqual({ status: 'ok', value: [ids[1]] }); expect(JSON.stringify(prepared.value)).toBe(before);
});
test('multiple selection keeps click order and removes only the exact logical observation', () => {
  const prepared = prepareSelection({ mode: 'internal', type: 'multiple', initial: ids }, known); if (prepared.status !== 'ok' || !prepared.value) throw Error('Bad fixture'); expect(toggleSelection(prepared.value, ids[1]!)).toEqual({ status: 'ok', value: [ids[0], ids[2]] });
});
test('controlled proposals do not change applied selection and accept immutable reconstruction', () => {
  const input = Object.freeze({ mode: 'controlled', type: 'single', value: Object.freeze([ids[0]]) }), prepared = prepareSelection(input, known); if (prepared.status !== 'ok' || !prepared.value) throw Error('Bad fixture');
  const proposed = toggleSelection(prepared.value, ids[1]!); expect(prepared.value.value).toEqual([ids[0]]); expect(proposed).toEqual({ status: 'ok', value: [ids[1]] });
  const accepted = prepareSelection({ ...input, value: proposed.status === 'ok' ? proposed.value : [] }, selectionIndex(ids.map(id => ({ ...id })))); expect(accepted.status).toBe('ok'); if (accepted.status === 'ok') expect(accepted.value?.value).toEqual([ids[1]]);
});
test('data replacement prunes missing internal identities but rejects unknown controlled identities atomically', () => {
  const previous = prepareSelection({ mode: 'internal', type: 'multiple', initial: ids }, known); if (previous.status !== 'ok') throw Error('Bad fixture'); const nextKnown = selectionIndex(ids.slice(1));
  const result = prepareSelection({ mode: 'internal', type: 'multiple', initial: ids }, nextKnown, previous.value); expect(result.status).toBe('ok'); if (result.status === 'ok') expect(result.value?.value).toEqual(ids.slice(1));
  expect(prepareSelection({ mode: 'controlled', type: 'multiple', value: ids }, nextKnown).status).toBe('invalid'); expect(previous.value?.value).toEqual(ids);
});
test('single cardinality, duplicates, unknown IDs, malformed bindings and accessors reject', () => {
  let calls = 0; const accessor = Object.defineProperty({}, 'mode', { enumerable: true, get() { calls++; return 'internal'; } });
  for (const value of [{ mode: 'internal', initial: ids }, { mode: 'controlled', value: [ids[0], ids[0]] }, { mode: 'controlled', value: [{ pointId: 'a' }] }, { mode: 'internal', value: [] }, { mode: 'controlled', initial: [], value: [] }, accessor]) expect(prepareSelection(value, known).status).toBe('invalid'); expect(calls).toBe(0);
});
test('multiple selection is bounded at 1000 and an over-limit toggle cannot mutate its owner', () => {
  const values = Array.from({ length: 1001 }, (_, index) => ({ pointId: 'p' + index })), index = selectionIndex(values), prepared = prepareSelection({ mode: 'internal', type: 'multiple', initial: values.slice(0, 1000) }, index);
  if (prepared.status !== 'ok' || !prepared.value) throw Error('Invalid fixture');
  expect(toggleSelection(prepared.value, values[1000]!).status).toBe('invalid'); expect(prepared.value.value.length).toBe(1000);
  expect(prepareSelection({ mode: 'controlled', type: 'multiple', value: values }, index).status).toBe('invalid');
  expect(replaceSelection(prepared.value, index, values).status).toBe('invalid');
});
test('disabling, internal type narrowing and ownership changes have one explicit immutable owner', () => {
  const previous = prepareSelection({ mode: 'internal', type: 'multiple', initial: ids }, known); if (previous.status !== 'ok') throw Error('Invalid fixture');
  const narrowed = prepareSelection({ mode: 'internal' }, known, previous.value); expect(narrowed.status).toBe('ok'); if (narrowed.status !== 'ok') return; expect(narrowed.value?.value).toEqual([ids[0]]);
  expect(selectionChanged(previous.value, narrowed.value)).toBe(true); expect(selectionChanged(narrowed.value, narrowed.value)).toBe(false);
  const controlled = prepareSelection({ mode: 'controlled', value: [ids[1]] }, known, narrowed.value); expect(controlled.status).toBe('ok'); if (controlled.status === 'ok') expect(controlled.value?.value).toEqual([ids[1]]);
  expect(prepareSelection(false, known, previous.value)).toEqual({ status: 'ok', value: null }); expect(prepareSelection(undefined, known)).toEqual({ status: 'ok', value: null }); expect(selectionChanged(null, null)).toBe(false);
});
test('selection snapshot owns frozen identity copies and rejected getters/proxies never escape', () => {
  const source = [{ seriesId: 'one', pointId: 'first' }], index = selectionIndex(source); source[0]!.pointId = 'mutated';
  const accepted = prepareSelection({ mode: 'controlled', value: [{ seriesId: 'one', pointId: 'first' }] }, index); expect(accepted.status).toBe('ok'); if (accepted.status !== 'ok' || !accepted.value) return;
  expect(Object.isFrozen(accepted.value)).toBe(true); expect(Object.isFrozen(accepted.value.value)).toBe(true); expect(Object.isFrozen(accepted.value.value[0])).toBe(true);
  expect(prepareSelection(new Proxy({}, { ownKeys() { throw Error('Hostile metadata'); } }), index).status).toBe('invalid');
});
test('500 deterministic toggles agree with an independent tuple-key set oracle', () => {
  const values = [{ pointId: 'a:b' }, { seriesId: 'a', pointId: 'b' }, { seriesId: 'a:b', pointId: 'c' }, { seriesId: 'a', pointId: 'b:c' }], index = selectionIndex(values), prepared = prepareSelection({ mode: 'internal', type: 'multiple' }, index);
  if (prepared.status !== 'ok' || !prepared.value) throw Error('Invalid fixture'); let owner = prepared.value, seed = 276391;
  const oracle = new Map<string, typeof values[number]>();
  for (let step = 0; step < 500; step++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const id = values[seed >>> 24 & 3]!, key = JSON.stringify([id.seriesId ?? null, id.pointId]); if (oracle.has(key)) oracle.delete(key); else oracle.set(key, id);
    const proposed = toggleSelection(owner, id); if (proposed.status !== 'ok') throw Error('Unexpected rejected toggle'); const next = replaceSelection(owner, index, proposed.value); if (next.status !== 'ok') throw Error('Unexpected rejected replacement'); owner = next.value;
    expect(owner.value).toEqual([...oracle.values()]);
  }
});
