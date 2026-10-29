import type { ChartResult } from './public/chart-types.js';
import type { ChartTextConfig, ChartTextContext } from './public/text-types.js';
import { createTextContext } from './internal/i18n/format.js';
import { createMessageContext } from './internal/i18n/messages.js';
import { record, ValidationFailure } from './internal/data/validation.js';
import { ok, invalid } from './internal/diagnostics.js';

/** Pure per-instance presentation context. No DOM, timers or global locale. */
export function createChartText(config: ChartTextConfig = {}): ChartResult<ChartTextContext> {
  try {
    const source = record(config, ['locale', 'timeZone', 'messages'], [], 'i18n');
    const format = createTextContext({ ...(Object.hasOwn(source, 'locale') ? { locale: source.locale } : {}), ...(Object.hasOwn(source, 'timeZone') ? { timeZone: source.timeZone } : {}) });
    if (format.status !== 'ok') return format;
    const messages = createMessageContext(Object.hasOwn(source, 'messages') ? source.messages : {}, format.value.number);
    if (messages.status !== 'ok') return messages;
    return ok(Object.freeze({ ...format.value, ...messages.value }));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_TEXT_CONFIG', 'i18n'); }
}
export type { ChartNumberFormat, ChartTimeTextPrecision, ChartFormattedText, ChartMessageKey, ChartMessages, ChartMessageArguments, ChartTextConfig, ChartTextContext } from './public/text-types.js';
