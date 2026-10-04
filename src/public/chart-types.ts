// @neural-charts/core: REQUIRED NOW, SHARED FUTURE CONTRACTS
export type ChartDiagnosticCode =
  | 'INVALID_CONFIG' | 'INVALID_NUMBER' | 'INVALID_DOMAIN'
  | 'UNKNOWN_CATEGORY' | 'LIFECYCLE_ERROR' | 'INTERNAL_INVARIANT';
export type ChartDiagnostic = Readonly<{
  code: ChartDiagnosticCode; reason: string; path: string; message: string;
}>;
export type ChartResult<V> =
  | Readonly<{ status: 'ok'; value: V }>
  | Readonly<{ status: 'invalid'; diagnostic: ChartDiagnostic }>;
export type ChartStatus =
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'loading'; message?: string }>
  | Readonly<{ kind: 'empty'; message?: string }>
  | Readonly<{ kind: 'error'; message: string }>;
export type ChartState = Readonly<{ hiddenSeriesIds: readonly string[] }>;
export type ChartStateBinding =
  | Readonly<{ mode: 'internal' }>
  | Readonly<{ mode: 'controlled'; value: ChartState }>;
export type ChartStateChange = Readonly<{
  state: ChartState; effect: 'proposal' | 'accepted';
  source: 'legend' | 'update'; revision: number;
}>;
export type ChartTheme = 'light' | 'dark' | 'auto';

