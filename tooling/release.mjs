import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {compareReleaseVersions} from './release-version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = manifest.version;
assert(/^\d+\.\d+\.\d+$/.test(version), 'Only stable, explicit versions can be released');
assert.equal(manifest.name, '@neural-charts/core');
assert.equal(manifest.license, 'MIT');
const tag = 'v' + version;
const command = (file, args) => execFileSync(file, args, {cwd: root, encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe']});
const registryVersion = async () => {
  const response = await fetch('https://registry.npmjs.org/@neural-charts%2fcore/' + version, {signal: AbortSignal.timeout(30_000)});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Registry returned HTTP ' + response.status);
  return response.json();
};
const verify = () => {
  assert.equal(manifest.repository.url, 'git+https://github.com/PedroMorenoTrujillo/neural-charts-core.git');
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert(readme.includes('Version ' + version), 'README version is stale');
  assert(readme.includes('npm install @neural-charts/core@' + version), 'Install example is stale');
  if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, tag, 'Tag must match package version');
  if (process.env.GITHUB_ACTIONS === 'true') {
    assert.equal(process.env.GITHUB_REPOSITORY, 'PedroMorenoTrujillo/neural-charts-core');
    command('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
  }
};

verify();
switch (process.argv[2]) {
  case 'verify':
    console.log('Release metadata verified: ' + tag);
    break;
  case 'publish': {
    assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Automated publication runs on GitHub');
    assert.equal(process.env.GITHUB_REF_TYPE, 'tag', 'Publication requires a version tag');
    const receipt = JSON.parse(readFileSync(new URL('../work/reports/package-current.json', import.meta.url), 'utf8'));
    assert.equal(receipt.status, 'passed');
    assert.equal(receipt.version, version);
    const before = await registryVersion();
    if (before) {
      assert.equal(before.dist?.integrity, receipt.sha512, 'Published version has different bytes; never overwrite it');
      console.log('Exact archive already published; safe rerun.');
    } else {
      const metadataResponse = await fetch('https://registry.npmjs.org/@neural-charts%2fcore', {signal: AbortSignal.timeout(30_000)});
      assert(metadataResponse.ok, 'Cannot verify the current latest version');
      const metadata = await metadataResponse.json();
      const latest = metadata['dist-tags']?.latest;
      if (latest) assert(compareReleaseVersions(version, latest) >= 0, 'Refusing to move npm latest to an older release');
      const archive = 'work/package-check/neural-charts-core-' + version + '.tgz';
      console.log(command('npm', ['publish', archive, '--access', 'public', '--tag', 'latest', '--provenance']));
    }
    let published;
    for (let attempt = 0; attempt < 20; attempt++) {
      published = await registryVersion();
      if (published) break;
      await delay(15_000);
    }
    assert(published, 'Registry has not exposed the accepted version yet; rerun safely later');
    assert.equal(published.dist?.integrity, receipt.sha512);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `Published **@neural-charts/core@${version}** with verified archive integrity and OIDC. This workflow publishes Core only; consumer packages and websites are unchanged.\n`);
    console.log('Public registry archive integrity verified.');
    break;
  }
  case 'record': {
    assert.equal(process.env.GITHUB_REF_TYPE, 'tag');
    try { command('gh', ['release', 'view', tag, '--json', 'tagName']); }
    catch {
      console.log(command('gh', ['release', 'create', tag, '--verify-tag', '--title', 'Neural Charts Core ' + version,
        '--notes', `Public MIT release of @neural-charts/core@${version}.\n\nStrict planning tests, ES2022-only declarations and isolated consumer checks passed before OIDC publication.\n\nInstall: npm install @neural-charts/core@${version}\n\nThis release does not automatically update or publish Native or deploy any website.`]));
    }
    break;
  }
  default: throw new Error('Use verify, publish or record');
}
