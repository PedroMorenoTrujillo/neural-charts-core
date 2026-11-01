import assert from 'node:assert/strict';

export function compareReleaseVersions(left, right) {
  const parse = version => {
    assert(typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version), 'Expected a stable release version');
    const parts = version.split('.').map(Number);
    assert(parts.every(Number.isSafeInteger), 'Version component is outside safe integer range');
    return parts;
  };
  const a = parse(left), b = parse(right);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}
