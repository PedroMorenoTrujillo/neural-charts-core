import { fail } from '../data/validation.js';
/** Byte accounting also rejects UTF-16 values that a UTF-8 Blob would replace. */
export function utf8Size(value: string, path: string): number {
  let size = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) fail(path, 'UNREPRESENTABLE_TEXT');
    size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return size;
}
