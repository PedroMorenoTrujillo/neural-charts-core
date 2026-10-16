import type { ChartResult } from '../../public/chart-types.js';
import type { PngOptions, PngImage } from '../../public/export-types.js';
import type { ExportLease } from './capture.js';
import { snapshotSvg } from './svg.js';
import { invalid, ok } from '../diagnostics.js';
import { record, number, fail, ValidationFailure } from '../data/validation.js';
const budgets = new WeakMap<Document, { jobs: number; pixels: number }>();

/** The only image decoder in Core: its source is an owned, generated SVG Blob.
 * It never accepts a URL, HTML, SVG markup or image resource from a consumer. */
export function rasterize(lease: ExportLease, options: PngOptions = {}): Promise<ChartResult<PngImage>> {
  const source = lease.snapshot, doc = source.document, owner = doc.defaultView;
  let config: Record<string, unknown>, pixelRatio: number, signal: AbortSignal | undefined;
  try {
    config = record(options, ['width', 'height', 'background', 'idPrefix', 'legend', 'pixelRatio', 'signal'], [], 'options');
    pixelRatio = Object.hasOwn(config, 'pixelRatio') ? number(config.pixelRatio, 'options.pixelRatio', .25, 4) : 1;
    if (!owner) fail('export.document', 'PLATFORM_UNAVAILABLE', 'LIFECYCLE_ERROR');
    if (Object.hasOwn(config, 'signal')) {
      const getter = Object.getOwnPropertyDescriptor(owner.AbortSignal.prototype, 'aborted')?.get;
      if (!getter) fail('options.signal', 'BAD_ABORT_SIGNAL');
      try { getter.call(config.signal); } catch { fail('options.signal', 'BAD_ABORT_SIGNAL'); }
      signal = config.signal as AbortSignal;
    }
  } catch (error) { lease.release(); return Promise.resolve(error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_EXPORT_OPTIONS', 'options')); }
  if (lease.signal.aborted || signal?.aborted) { lease.release(); return Promise.resolve(invalid('LIFECYCLE_ERROR', 'EXPORT_ABORTED', 'export.png')); }
  const { pixelRatio: _ratio, signal: _signal, ...svgOptions } = config;
  const vector = snapshotSvg(source, svgOptions);
  if (vector.status === 'invalid') { lease.release(); return Promise.resolve(vector); }
  const width = Math.ceil(vector.value.width * pixelRatio), height = Math.ceil(vector.value.height * pixelRatio);
  if (width > 16384 || height > 16384 || width * height > 16777216) { lease.release(); return Promise.resolve(invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'export.png')); }
  const budget = budgets.get(doc) ?? { jobs: 0, pixels: 0 }, pixels = width * height;
  if (budget.jobs >= 4 || budget.pixels + pixels > 33554432) { lease.release(); return Promise.resolve(invalid('LIFECYCLE_ERROR', 'EXPORT_BUSY', 'export.png')); }
  budget.jobs++; budget.pixels += pixels; budgets.set(doc, budget);
  return new Promise(resolve => {
    let image: HTMLImageElement | null = null, canvas: HTMLCanvasElement | null = null, ownedUrl: string | null = null, timeout: number | null = null, done = false;
    function finish(result: ChartResult<PngImage>): void {
      if (done) return; done = true;
      let failed = false; const release = (task: () => void): void => { try { task(); } catch { failed = true; } };
      if (timeout !== null) { release(() => owner!.clearTimeout(timeout!)); timeout = null; }
      release(() => lease.signal.removeEventListener('abort', aborted)); release(() => signal?.removeEventListener('abort', aborted));
      if (image) { release(() => { image!.onload = null; image!.onerror = null; image!.removeAttribute('src'); }); image = null; }
      if (ownedUrl !== null) { release(() => owner!.URL.revokeObjectURL(ownedUrl!)); ownedUrl = null; }
      if (canvas) { release(() => { canvas!.width = 0; canvas!.height = 0; }); canvas = null; }
      budget.jobs--; budget.pixels -= pixels; if (!budget.jobs) budgets.delete(doc);
      lease.release(); resolve(failed ? invalid('LIFECYCLE_ERROR', 'EXPORT_CLEANUP_FAILED', 'export.png') : result);
    }
    function aborted(): void { finish(invalid('LIFECYCLE_ERROR', 'EXPORT_ABORTED', 'export.png')); }
    try {
      lease.signal.addEventListener('abort', aborted, { once: true }); signal?.addEventListener('abort', aborted, { once: true });
      if (lease.signal.aborted || signal?.aborted) { aborted(); return; }
      timeout = owner!.setTimeout(() => finish(invalid('LIFECYCLE_ERROR', 'EXPORT_TIMEOUT', 'export.png')), 25000);
      const svgBlob = new owner!.Blob([vector.value.svg], { type: 'image/svg+xml;charset=utf-8' });
      ownedUrl = owner!.URL.createObjectURL(svgBlob);
      image = doc.createElement('img');
      image.onerror = () => finish(invalid('LIFECYCLE_ERROR', 'SVG_DECODE_FAILED', 'export.png'));
      image.onload = () => {
        if (done || lease.signal.aborted || signal?.aborted) { aborted(); return; }
        try {
          canvas = doc.createElement('canvas'); canvas.width = width; canvas.height = height;
          const context = canvas.getContext('2d'); if (!context) { finish(invalid('LIFECYCLE_ERROR', 'CANVAS_UNAVAILABLE', 'export.png')); return; }
          context.drawImage(image!, 0, 0, width, height);
          canvas.toBlob(blob => { if (!done) finish(blob ? ok(Object.freeze({ blob, width, height, revision: vector.value.revision })) : invalid('LIFECYCLE_ERROR', 'PNG_ENCODE_FAILED', 'export.png')); }, 'image/png');
        } catch { finish(invalid('LIFECYCLE_ERROR', 'PNG_ENCODE_FAILED', 'export.png')); }
      };
      image.src = ownedUrl;
    } catch { finish(invalid('LIFECYCLE_ERROR', 'PNG_EXPORT_UNAVAILABLE', 'export.png')); }
  });
}
