import assert from 'node:assert/strict';
import test from 'node:test';
import {waitForRegistry} from './registry-propagation.mjs';

function clock() {
  let value = 0;
  return {now: () => value, sleep: async ms => { value += ms; }};
}

test('an already visible package is checked without any wait', async () => {
  const value = {version: '0.0.4', dist: {integrity: 'original'}};
  const actual = await waitForRegistry(async () => value, {sleep: () => assert.fail('unexpected delay')});
  assert.equal(actual, value);
});

test('propagation beyond five minutes preserves the exact registry metadata', async () => {
  const timer = clock(), pending = [];
  const value = {version: '0.0.4', dist: {integrity: 'verified'}};
  const actual = await waitForRegistry(async () => timer.now() >= 345_000 ? value : null, {...timer, onPending: n => pending.push(n)});
  assert.equal(actual, value);
  assert.equal(timer.now(), 345_000);
  assert.equal(pending.length, 23);
});

test('timeout is bounded and explains safe verification rather than another release', async () => {
  const timer = clock();
  await assert.rejects(waitForRegistry(async () => null, {...timer, timeoutMs: 16_000}), /Rerun this verification; do not change or republish/);
  assert.equal(timer.now(), 16_000);
});

test('authorization and other registry errors are not disguised as propagation', async () => {
  const failure = new Error('Registry returned HTTP403');
  await assert.rejects(waitForRegistry(async () => { throw failure; }, clock()), error => error === failure);
});
