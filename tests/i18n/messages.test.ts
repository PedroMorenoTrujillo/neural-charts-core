import { expect, test } from 'vitest';
import { createMessageContext, defaultMessages } from '../../src/internal/i18n/messages.js';
import { createTextContext } from '../../src/internal/i18n/format.js';
import type { Result } from '../../src/internal/diagnostics.js';
function value<T>(r: Result<T>): T { expect(r.status).toBe('ok'); if (r.status !== 'ok') throw Error(r.diagnostic.message); return r.value; }

test('engine text defaults remain immutable and independent per instance', () => {
  const translated = value(createMessageContext(Object.freeze({ viewDataTable: 'Ver datos', dataHeading: 'Datos de {title}' })));
  expect(value(translated.message('viewDataTable'))).toBe('Ver datos'); expect(value(translated.message('dataHeading', { title: 'Ventas' }))).toBe('Datos de Ventas');
  expect(value(value(createMessageContext()).message('viewDataTable'))).toBe('View data table'); expect(Object.isFrozen(defaultMessages)).toBe(true);
});
test('translation reorders named slots without losing original values', () => {
  const messages = value(createMessageContext({ viewportAxis: 'De {from} a {to}, eje {axis}' }));
  expect(value(messages.message('viewportAxis', { axis: 'X', from: -3, to: 0 }))).toBe('De -3 a 0, eje X');
});
test('numbers use the same per-instance context without converting caller strings', () => {
  const formatter = value(createTextContext({ locale: 'es-ES' })), messages = value(createMessageContext({}, formatter.number));
  expect(value(messages.message('selectionSummary', { count: 12345 }))).toContain('12.345');
  expect(value(messages.message('dataHeading', { title: '12345' }))).toBe('12345 — data');
});
test('consumer braces, HTML-looking text and dollar sequences are literal and never recursively replaced', () => {
  const messages = value(createMessageContext());
  const title = 'A{page} <script>not code</script> $& $`';
  expect(value(messages.message('dataHeading', { title }))).toBe(title + ' — data');
});
test.each([{ pageAnnouncement: 'No slots' }, { dataHeading: '{unknown}' }, { dataHeading: '{title.name}' }, { dataHeading: '{{title}}' }, { noData: '' }, { noData: '  ' }, { noData: '\u0000' }, { noData: '\ud800' }, { noData: '\udc00' }, { unknownKey: 'Other' }, { noData: undefined }])('closed templates reject malformed translation %j', spec => {
  expect(createMessageContext(spec).status).toBe('invalid');
});
test.each([undefined, null, { title: undefined }, { wrong: 'x' }, { title: 'x', extra: 'y' }, { title: new String('x') }])('required and unknown arguments are checked: %j', args => {
  expect(value(createMessageContext()).message('dataHeading', args).status).toBe('invalid');
});
test.each([NaN, Infinity, -Infinity])('nonfinite counts are rejected %s', count => { expect(value(createMessageContext()).message('selectionSummary', { count }).status).toBe('invalid'); });
test('unknown message keys and accessors are contained without execution', () => {
  expect(value(createMessageContext()).message('__proto__').status).toBe('invalid');
  let invoked = 0; const spec = Object.defineProperty({}, 'noData', { enumerable: true, get() { invoked++; return 'x'; } });
  expect(createMessageContext(spec).status).toBe('invalid'); expect(invoked).toBe(0);
  const args = Object.defineProperty({}, 'title', { enumerable: true, get() { invoked++; return 'x'; } });
  expect(value(createMessageContext()).message('dataHeading', args).status).toBe('invalid'); expect(invoked).toBe(0);
});
test('emoji and RTL translations remain plain valid Unicode', () => {
  const m = value(createMessageContext({ noData: 'لا توجد بيانات 🗂️' })); expect(value(m.message('noData'))).toBe('لا توجد بيانات 🗂️');
});
