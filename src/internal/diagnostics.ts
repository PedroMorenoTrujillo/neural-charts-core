export type DiagnosticCode = 'INVALID_CONFIG' | 'INVALID_NUMBER' | 'INVALID_DOMAIN' | 'UNKNOWN_CATEGORY' | 'LIFECYCLE_ERROR' | 'INTERNAL_INVARIANT';
export type Diagnostic = Readonly<{ code: DiagnosticCode; path: string; message: string; reason: string }>;
export type Result<T> = { readonly status: 'ok'; readonly value: T } | { readonly status: 'invalid'; readonly diagnostic: Diagnostic };
export const ok = <T>(value: T): Result<T> => ({ status: 'ok', value });
export function invalid(code: DiagnosticCode, reason: string, path = '', message = reason): { readonly status: 'invalid'; readonly diagnostic: Diagnostic } {
  return { status: 'invalid', diagnostic: Object.freeze({ code, reason: reason.slice(0, 64), path: path.slice(0, 256), message: message.slice(0, 512) }) };
}
export function notify(sink: ((diagnostic: Diagnostic) => void) | undefined, diagnostic: Diagnostic): void {
  try { sink?.(diagnostic); } catch { /* A diagnostic sink cannot interrupt cleanup. */ }
}
export type DevelopmentNoticeReason = 'TICK_RESOLUTION_FALLBACK';
export type DevelopmentNotice = Readonly<{ kind: 'development-notice'; reason: DevelopmentNoticeReason; path: string; message: string }>;
export type DevelopmentNoticeSink = (notice: DevelopmentNotice) => void;
export function notifyTickFallback(sink: DevelopmentNoticeSink | undefined): void {
  try { sink?.(Object.freeze({ kind: 'development-notice', reason: 'TICK_RESOLUTION_FALLBACK', path: 'ticks', message: 'No representable regular tick grid; finite domain endpoints selected.' })); }
  catch { /* Development notices cannot change a valid numerical result. */ }
}
