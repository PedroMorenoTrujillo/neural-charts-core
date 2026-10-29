import type { Result } from '../diagnostics.js';
import { ok, invalid } from '../diagnostics.js';
import { record, text, number, choice, fail, ValidationFailure } from '../data/validation.js';
import type { ChartFormattedText as FormattedText, ChartTimeTextPrecision as TimeTextPrecision } from '../../public/text-types.js';

// Private foundation: no chart opts or public locale support are claimed until
// validators, descriptions and all presentation ports consume this context.
export type { ChartNumberFormat as NumberTextFormat, ChartTimeTextPrecision as TimeTextPrecision, ChartFormattedText as FormattedText } from '../../public/text-types.js';
export type TextContext = Readonly<{
  locale: string | null; timeZone: string; localizedTime: boolean;
  number(value: unknown, format?: unknown): Result<FormattedText>;
  time(value: unknown, precision?: TimeTextPrecision): Result<FormattedText>;
}>;
function contained<T>(path: string, action: () => T): Result<T> {
  try { return ok(action()); }
  catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'UNSUPPORTED_TEXT_FORMAT', path); }
}
function numberOptions(input: unknown): Intl.NumberFormatOptions {
  const p = record(input, ['style', 'currency', 'unit', 'notation', 'precision', 'useGrouping'], [], 'format');
  const style = Object.hasOwn(p, 'style') ? choice(p.style, ['decimal', 'percent', 'currency', 'unit'], 'format.style') : 'decimal';
  const options: Intl.NumberFormatOptions = { style };
  if (style === 'currency') {
    const currency = text(p.currency, 'format.currency', 3);
    if (!/^[A-Z]{3}$/.test(currency)) fail('format.currency');
    options.currency = currency;
  } else if (Object.hasOwn(p, 'currency')) fail('format.currency');
  if (style === 'unit') options.unit = text(p.unit, 'format.unit', 64);
  else if (Object.hasOwn(p, 'unit')) fail('format.unit');
  if (Object.hasOwn(p, 'notation')) options.notation = choice(p.notation, ['standard', 'scientific', 'compact'] as const, 'format.notation');
  if (Object.hasOwn(p, 'useGrouping')) { if (typeof p.useGrouping !== 'boolean') fail('format.useGrouping'); options.useGrouping = p.useGrouping; }
  if (Object.hasOwn(p, 'precision')) {
    const precision = record(p.precision, ['kind', 'digits'], ['kind', 'digits'], 'format.precision');
    const kind = choice(precision.kind, ['fraction', 'significant'], 'format.precision.kind');
    const digits = number(precision.digits, 'format.precision.digits', kind === 'fraction' ? 0 : 1, kind === 'fraction' ? 20 : 21);
    if (!Number.isInteger(digits)) fail('format.precision.digits');
    if (kind === 'fraction') { options.minimumFractionDigits = digits; options.maximumFractionDigits = digits; }
    else options.maximumSignificantDigits = digits;
  } else if (style !== 'currency') {
    // Native default fractional rounding would turn tiny finite values into0.
    // Monetary defaults retain the currency's standard minor-unit policy;
    // raw always remains the canonical unrounded original, including there.
    options.maximumSignificantDigits = 17;
  }
  return options;
}

export function createTextContext(input: unknown = {}): Result<TextContext> {
  return contained('i18n', () => {
    const config = record(input, ['locale', 'timeZone'], [], 'i18n');
    const hasLocale = Object.hasOwn(config, 'locale'), hasTimeZone = Object.hasOwn(config, 'timeZone');
    let platform: typeof Intl | undefined;
    function intl(): typeof Intl {
      if (!platform) { if (typeof globalThis.Intl !== 'object' || globalThis.Intl === null) fail('i18n', 'INTL_UNAVAILABLE'); platform = globalThis.Intl; }
      return platform;
    }
    let locale: string | null = null, zone = 'UTC';
    if (hasLocale) {
      const requested = text(config.locale, 'i18n.locale', 128), api = intl();
      const canonical = api.getCanonicalLocales(requested)[0];
      if (!canonical || !api.NumberFormat.supportedLocalesOf(canonical).length || !api.DateTimeFormat.supportedLocalesOf(canonical).length) fail('i18n.locale', 'UNSUPPORTED_LOCALE');
      locale = canonical;
    }
    if (hasTimeZone) zone = new (intl().DateTimeFormat)(locale ?? 'en-US', { timeZone: text(config.timeZone, 'i18n.timeZone', 128) }).resolvedOptions().timeZone;
    const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
    function cached(key: string, construct: () => Intl.NumberFormat | Intl.DateTimeFormat): Intl.NumberFormat | Intl.DateTimeFormat {
      const existing = cache.get(key);
      if (existing) { cache.delete(key); cache.set(key, existing); return existing; }
      const formatter = construct();
      if (cache.size >= 16) cache.delete(cache.keys().next().value!);
      cache.set(key, formatter); return formatter;
    }
    return Object.freeze({
      locale, timeZone: zone, localizedTime: hasLocale || hasTimeZone,
      number(value: unknown, format?: unknown): Result<FormattedText> {
        return contained('format', () => {
          const numeric = number(value, 'value'), raw = String(numeric);
          if (!hasLocale && format === undefined) return Object.freeze({ text: raw, raw });
          const options = numberOptions(format === undefined ? {} : format), key = 'number:' + JSON.stringify(options);
          const result = cached(key, () => new (intl().NumberFormat)(locale ?? 'en-US', options)).format(numeric);
          return Object.freeze({ text: result, raw });
        });
      },
      time(value: unknown, precision?: TimeTextPrecision): Result<FormattedText> {
        return contained('timeFormat', () => {
          const epoch = number(value, 'time', -8.64e15, 8.64e15);
          if (!Number.isInteger(epoch)) fail('time', 'INTEGER_TIME_REQUIRED', 'INVALID_NUMBER');
          const date = new Date(epoch), raw = date.toISOString();
          const unit = choice(precision === undefined ? 'full' : precision, ['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'full'], 'timeFormat.precision');
          // Like an explicit numeric descriptor, an explicit time precision
          // opts into Intl with deterministic en-US/UTC fallbacks. Omitting
          // all formatting requests preserves canonical raw UTC detail.
          if (!hasLocale && !hasTimeZone && precision === undefined) return Object.freeze({ text: raw, raw });
          const level = ['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'full'].indexOf(unit);
          const era = date.getUTCFullYear() <= 1;
          const options: Intl.DateTimeFormatOptions = { timeZone: zone, year: 'numeric', ...(era ? { era: 'short' } : {}),
            ...(level >= 1 ? { month: '2-digit' } : {}), ...(level >= 2 ? { day: '2-digit' } : {}),
            ...(level >= 3 ? { hour: '2-digit', timeZoneName: 'shortOffset', hourCycle: 'h23' } : {}),
            ...(level >= 4 ? { minute: '2-digit' } : {}), ...(level >= 5 ? { second: '2-digit' } : {}),
            ...(level >= 6 ? { fractionalSecondDigits: 3 } : {}) };
          const key = 'time:' + unit + ':' + String(era);
          const result = cached(key, () => new (intl().DateTimeFormat)(locale ?? 'en-US', options)).format(epoch);
          return Object.freeze({ text: result, raw });
        });
      },
    });
  });
}
