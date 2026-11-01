import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compareReleaseVersions} from './release-version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const {version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const run = (task, overrides = {}) => spawnSync(process.execPath, ['tooling/release.mjs', task], {
  cwd: root, encoding: 'utf8', timeout: 20_000,
  env: {...process.env, GITHUB_ACTIONS: 'false', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main', ...overrides},
});

test('release metadata and exact tag are accepted without publishing', () => {
  assert.equal(run('verify').status, 0);
  assert.equal(run('verify', {GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v' + version}).status, 0);
});
test('a mismatched or injected tag is rejected before publication', () => {
  for (const tag of ['v999.0.0', 'v' + version + '\nother-command']) {
    const result = run('verify', {GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: tag});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Tag must match package version/);
  }
});
test('a different repository cannot reuse the publisher', () => {
  const result = run('verify', {GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'another/core'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /neural-charts-core/);
});
test('local execution cannot publish or create a release', () => {
  const result = run('publish');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Automated publication runs on GitHub/);
  assert.notEqual(run('record').status, 0);
});
test('release ordering prevents latest from moving backwards and compares numbers', () => {
  assert.equal(compareReleaseVersions('0.0.2', '0.0.3'), -1);
  assert.equal(compareReleaseVersions('0.0.10', '0.0.2'), 1);
  assert.equal(compareReleaseVersions('0.1.0', '0.0.99'), 1);
  assert.equal(compareReleaseVersions('1.0.0', '1.0.0'), 0);
});
test('ambiguous, prerelease and unrepresentable version components are rejected', () => {
  for (const value of ['01.0.0', '1.0.0-beta', '1.0.0\n', '99999999999999999999.0.0']) {
    assert.throws(() => compareReleaseVersions(value, '1.0.0'));
  }
});
