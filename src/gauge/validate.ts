import type { ChartResult } from '../public/chart-types.js';
import type { GaugeChartSpec, GaugeMountOptions } from '../public/gauge-types.js';
import { ok, invalid } from '../internal/diagnostics.js';
import { array, record, choice, color, number, optional, text, fail, ValidationFailure } from '../internal/data/validation.js';
import { infoConfig } from '../internal/data/info-config.js';
export function validateGauge<T>(input: unknown): ChartResult<GaugeChartSpec<T>> {
  try {
    const value = record(input, ['family', 'title', 'description', 'value', 'domain', 'datum', 'preset', 'unit', 'color', 'bands', 'target', 'theme', 'direction', 'font', 'motion', 'status', 'tooltip'], ['family', 'title', 'value', 'domain'], 'spec', ['datum']);
    choice(value.family, ['gauge'], 'family'); infoConfig(value);
    value.value = value.value === null ? null : number(value.value, 'value');
    const domain = array(value.domain, 2, 'domain'); if (domain.length !== 2) fail('domain');
    const minimum = number(domain[0], 'domain[0]'), maximum = number(domain[1], 'domain[1]'); if (minimum >= maximum) fail('domain', 'REVERSED', 'INVALID_DOMAIN'); value.domain = Object.freeze([minimum, maximum]);
    optional(value, 'preset', (v, p) => choice(v, ['arc', 'ring'], p), 'spec'); optional(value, 'unit', (v, p) => text(v, p, 64, true), 'spec'); optional(value, 'color', color, 'spec');
    if (Object.hasOwn(value, 'target')) { const target = record(value.target, ['value', 'label'], ['value'], 'target'); target.value = number(target.value, 'target.value'); optional(target, 'label', text, 'target'); value.target = Object.freeze(target); }
    if (Object.hasOwn(value, 'bands')) {
      const bands = array(value.bands, 32, 'bands'), ids = new Set<string>(); let previous = minimum;
      value.bands = Object.freeze(bands.map((item, index) => { const path = 'bands[' + index + ']', band = record(item, ['id', 'from', 'to', 'color', 'label'], ['id', 'from', 'to', 'color'], path);
        const id = text(band.id, path + '.id'); if (ids.has(id)) fail(path + '.id', 'DUPLICATE_ID'); ids.add(id); band.id = id;
        const from = number(band.from, path + '.from', minimum, maximum), to = number(band.to, path + '.to', minimum, maximum); band.from = from; band.to = to;
        if (from >= to || from < previous) fail(path, 'OVERLAPPING_OR_UNORDERED_BANDS'); previous = to;
        band.color = color(band.color, path + '.color'); optional(band, 'label', text, path); return Object.freeze(band);
      }));
    }
    return ok(Object.freeze(value) as unknown as GaugeChartSpec<T>);
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_SPEC', 'spec'); }
}
export function validateGaugeOptions(input: unknown): ChartResult<GaugeMountOptions> {
  try { const value = record(input, ['instanceId', 'onDiagnostic'], ['instanceId'], 'options'), id = text(value.instanceId, 'options.instanceId', 64); if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) fail('options.instanceId', 'BAD_INSTANCE_ID'); if (Object.hasOwn(value, 'onDiagnostic') && typeof value.onDiagnostic !== 'function') fail('options.onDiagnostic'); return ok(Object.freeze(value) as unknown as GaugeMountOptions); }
  catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_OPTIONS', 'options'); }
}
