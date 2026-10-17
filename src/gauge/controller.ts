import type { ChartResult } from '../public/chart-types.js';
import type { GaugeChartSpec, GaugeMountOptions, GaugeController, GaugeSnapshot } from '../public/gauge-types.js';
import { mountFamily } from '../internal/chart/family-controller.js';
import { aliasExport } from '../internal/export/capture.js';
import { gaugePolicy } from './strategy.js';
import { ok, invalid } from '../internal/diagnostics.js';
export function mountGauge<T>(host: HTMLElement, spec: GaugeChartSpec<T>, options: GaugeMountOptions): ChartResult<GaugeController<T>> {
  const mounted = mountFamily(host, spec, options, gaugePolicy<T>()); if (mounted.status === 'invalid') return mounted;
  const owner = mounted.value; let release: (() => void) | null = null;
  const controller: GaugeController<T> = Object.freeze({ update: (next: GaugeChartSpec<T>) => owner.update(next), refresh: () => owner.refresh(), getState: () => owner.getState(), getSnapshot: () => owner.getSnapshot() as GaugeSnapshot, destroy() { release?.(); release = null; owner.destroy(); } });
  try { release = aliasExport(controller, owner); return ok(controller); } catch { owner.destroy(); return invalid('INTERNAL_INVARIANT', 'EXPORT_OWNER_FAILED', 'controller'); }
}
