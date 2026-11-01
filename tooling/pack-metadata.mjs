import assert from 'node:assert/strict';

/** npm 10/11 return an array; npm 12 returns a package-name keyed object. */
export function packedMetadata(output, name, version) {
  const value = JSON.parse(output);
  const records = Array.isArray(value) ? value :
    value && typeof value === 'object' && Object.keys(value).length === 1 && Object.hasOwn(value, name) ? [value[name]] : [];
  assert.equal(records.length, 1, 'Expected one packed package');
  const packed = records[0];
  assert(packed && typeof packed === 'object', 'Missing packed metadata');
  assert.equal(packed.name, name, 'Unexpected packed package');
  assert.equal(packed.version, version, 'Unexpected packed version');
  assert.equal(packed.filename, name.replace(/^@/, '').replace('/', '-') + '-' + version + '.tgz', 'Unexpected archive filename');
  assert(Array.isArray(packed.files), 'Missing packed file list');
  assert(typeof packed.integrity === 'string' && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(packed.integrity), 'Missing archive integrity');
  return packed;
}
