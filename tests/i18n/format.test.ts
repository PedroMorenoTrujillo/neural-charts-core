import { describe, expect, test } from 'vitest';
import { createTextContext, type TextContext } from '../../src/internal/i18n/format.js';
import type { Result } from '../../src/internal/diagnostics.js';
function value<T>(result: Result<T>): T { expect(result.status).toBe('ok'); if (result.status !== 'ok') throw new Error(result.diagnostic.message); return result.value; }
const context = (spec: unknown = {}): TextContext => value(createTextContext(spec));

describe('private per-instance Intl foundation, not yet chart API support', () => {
  test.each([0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, .30000000000000004, 1e-30, 12345.5])('default numeric text keeps exact canonical original %s', n => {
    const result = value(context().number(n)); expect(result).toEqual({ text: String(n === 0 ? 0 : n), raw: String(n === 0 ? 0 : n) }); expect(Object.isFrozen(result)).toBe(true);
  });
  test.each([-8.64e15, -62167219200000, -1, 0, 8.64e15])('default UTC detail preserves the full timestamp %s', epoch => {
    expect(value(context().time(epoch))).toEqual({ text: new Date(epoch).toISOString(), raw: new Date(epoch).toISOString() });
  });
  test('locale belongs to each context and does not mutate the caller or another chart', () => {
    const spec = Object.freeze({ locale: 'es-es' }), spanish = context(spec), english = context({ locale: 'en-US' });
    expect(spanish.locale).toBe('es-ES'); expect(value(spanish.number(12345.5))).toEqual({ text: '12.345,5', raw: '12345.5' });
    expect(value(english.number(12345.5)).text).toBe('12,345.5'); expect(value(context().number(12345.5)).text).toBe('12345.5'); expect(spec.locale).toBe('es-es');
  });
  test('localized tiny finite values do not silently become zero under default decimal rounding', () => {
    for (const n of [Number.MIN_VALUE, -Number.MIN_VALUE, 1e-30]) { const out = value(context({ locale: 'en-US' }).number(n)); expect(out.raw).toBe(String(n)); expect(out.text).toMatch(/[1-9]/); expect(out.text).not.toMatch(/NaN|Infinity/); }
  });
  test('explicit rounding, percent and monetary units retain the unrounded original', () => {
    const c = context({ locale: 'en-US' });
    expect(value(c.number(1.23456, { precision: { kind: 'fraction', digits: 2 } }))).toEqual({ text: '1.23', raw: '1.23456' });
    expect(value(c.number(.25, { style: 'percent' }))).toEqual({ text: '25%', raw: '0.25' });
    expect(value(c.number(12.3456, { style: 'currency', currency: 'USD' }))).toEqual({ text: '$12.35', raw: '12.3456' });
    const unit = value(c.number(12.5, { style: 'unit', unit: 'kilometer-per-hour' })); expect(unit.text).toContain('km/h'); expect(unit.raw).toBe('12.5');
  });
  test('folded local hours remain distinguishable by offset without changing UTC observations', () => {
    const c = context({ locale: 'en-GB', timeZone: 'Europe/Madrid' });
    const first = Date.parse('2024-10-27T00:30:00.000Z'), second = Date.parse('2024-10-27T01:30:00.000Z');
    const a = value(c.time(first, 'minute')), b = value(c.time(second, 'minute'));
    expect(a.text).toContain('02:30'); expect(b.text).toContain('02:30'); expect(a.text).not.toBe(b.text);
    expect(a.raw).toBe('2024-10-27T00:30:00.000Z'); expect(b.raw).toBe('2024-10-27T01:30:00.000Z');
  });
  test('timeZone alone changes only opted-in date display, not number defaults', () => {
    const c = context({ timeZone: 'Europe/Madrid' }); expect(value(c.number(12345.5)).text).toBe('12345.5'); expect(value(c.time(0)).text).not.toBe(value(c.time(0)).raw);
  });
  test('an explicit time precision is applied even without a configured locale', () => {
    const c = context(); expect(value(c.time(0, 'year'))).toEqual({ text: '1970', raw: '1970-01-01T00:00:00.000Z' });
    expect(value(c.time(0)).text).toBe('1970-01-01T00:00:00.000Z');
  });
  test.each([NaN, Infinity, -Infinity, '1', null, undefined])('invalid numeric input is contained: %s', input => { expect(context().number(input).status).toBe('invalid'); expect(context().time(input).status).toBe('invalid'); });
  test.each([.5, 8.64e15 + 1, -8.64e15 - 1])('invalid Date range or fractional epoch is contained: %s', input => { expect(context({ locale: 'es-ES' }).time(input).status).toBe('invalid'); });
  test.each([{ locale: '' }, { locale: 'not_a_locale' }, { locale: 'zz-ZZ' }, { timeZone: 'Not/A_Zone' }, { timeZone: '' }, { locale: undefined }, { callback: () => '' }])('invalid/unsupported settings never silently fall back: %j', input => { expect(createTextContext(input).status).toBe('invalid'); });
  test.each([{ style: 'currency' }, { style: 'currency', currency: 'usd' }, { style: 'unit', unit: 'made-up' }, { unit: 'meter' }, { currency: 'USD' }, { useGrouping: 1 }, { precision: { kind: 'fraction', digits: -1 } }, { precision: { kind: 'significant', digits: 22 } }, { precision: { kind: 'fraction', digits: 1.5 } }, { precision: undefined }, { formatter: () => 'x' }])('closed descriptors reject malformed formatting: %j', format => { expect(context().number(1, format).status).toBe('invalid'); });
  test('configuration getters are rejected without execution and throwing proxies are contained', () => {
    let called = 0; const input = Object.defineProperty({}, 'locale', { enumerable: true, get() { called++; throw new Error('not invoked'); } });
    expect(createTextContext(input).status).toBe('invalid'); expect(called).toBe(0);
    expect(createTextContext(new Proxy({}, { getPrototypeOf() { throw new Error('contained'); } })).status).toBe('invalid');
  });
  test('explicit null formatting and descriptor getters are invalid without execution', () => {
    expect(context().number(1, null).status).toBe('invalid');
    let invoked = 0; const format = Object.defineProperty({}, 'notation', { enumerable: true, get() { invoked++; return 'compact'; } });
    expect(context().number(1, format).status).toBe('invalid'); expect(invoked).toBe(0);
  });
  test('raw contexts and raw values do not read the Intl platform', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Intl')!; let reads = 0;
    let created: ReturnType<typeof createTextContext>, numeric: unknown, temporal: unknown;
    Object.defineProperty(globalThis, 'Intl', { configurable: true, get() { reads++; throw new Error('No ambient platform reads'); } });
    try { created = createTextContext(); if (created.status === 'ok') { numeric = created.value.number(1234.5); temporal = created.value.time(0); } }
    finally { Object.defineProperty(globalThis, 'Intl', descriptor); }
    expect(reads).toBe(0); expect(created!.status).toBe('ok'); expect(numeric).toEqual({ status: 'ok', value: { text: '1234.5', raw: '1234.5' } });
    expect(temporal).toEqual({ status: 'ok', value: { text: '1970-01-01T00:00:00.000Z', raw: '1970-01-01T00:00:00.000Z' } });
  });
  test('localized extreme years and Date endpoints retain their original UTC identity', () => {
    const c = context({ locale: 'en-GB', timeZone: 'UTC' });
    for (const epoch of [-8.64e15, -62167219200000, 8.64e15]) { const out = value(c.time(epoch)); expect(out.raw).toBe(new Date(epoch).toISOString()); expect(out.text).not.toMatch(/NaN|Infinity/); }
  });
  test('mixed numeric/date formatter reuse is bounded per owner and evicts stale formats', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'NumberFormat')!;
    let constructions = 0;
    const NativeNumberFormat = Intl.NumberFormat;
    Object.defineProperty(Intl, 'NumberFormat', { ...descriptor, value: new Proxy(NativeNumberFormat, {
      construct(target, args) { constructions++; return Reflect.construct(target, args); },
    }) });
    try {
      const a = context(), b = context();
      for (let digits = 0; digits < 16; digits++) value(a.number(1.2345, { precision: { kind: 'fraction', digits } }));
      expect(constructions).toBe(16);
      value(a.number(2, { precision: { kind: 'fraction', digits: 15 } })); expect(constructions).toBe(16);
      value(a.time(0, 'year')); // One shared cache for both formatter types.
      value(a.number(1, { precision: { kind: 'fraction', digits: 0 } })); expect(constructions).toBe(17);
      value(b.number(1, { precision: { kind: 'fraction', digits: 15 } })); expect(constructions).toBe(18);
    } finally { Object.defineProperty(Intl, 'NumberFormat', descriptor); }
  });
});
