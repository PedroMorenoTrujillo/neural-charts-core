import {test} from 'node:test';
import assert from 'node:assert/strict';
import {packedMetadata} from './pack-metadata.mjs';

const name = '@neural-charts/core';
const version = '0.0.3';
const record = {name, version, filename: 'neural-charts-core-0.0.3.tgz', files: [], integrity: 'sha512-YWJjZA=='};
test('npm 10/11 array archive metadata is accepted', () => {
  assert.deepEqual(packedMetadata(JSON.stringify([record]), name, version), record);
});
test('npm 12 keyed archive metadata is accepted', () => {
  assert.deepEqual(packedMetadata(JSON.stringify({[name]: record}), name, version), record);
});
test('ambiguous or wrong-package metadata is rejected', () => {
  for (const value of [null, [], [record, record], {'other/package': record}, {[name]: {...record, name: 'other'}}]) {
    assert.throws(() => packedMetadata(JSON.stringify(value), name, version));
  }
});
test('wrong versions, paths, file lists and integrity are rejected', () => {
  for (const patch of [{version: '0.0.2'}, {filename: '../outside.tgz'}, {files: null}, {integrity: ''}]) {
    assert.throws(() => packedMetadata(JSON.stringify([({...record, ...patch})]), name, version));
  }
});
