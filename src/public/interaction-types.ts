/** Domain identity; a radial observation has no invented Cartesian series. */
export type SeriesPointId = Readonly<{ seriesId: string; pointId: string }>;
export type SlicePointId = Readonly<{ pointId: string; seriesId?: never }>;
export type ChartDatumId = Readonly<{ pointId: string; seriesId?: string }>;
export type ChartSelectionBinding<Id extends ChartDatumId = ChartDatumId> = false
  | Readonly<{ mode: 'internal'; kind?: 'single' | 'multiple'; initial?: readonly Id[] }>
  | Readonly<{ mode: 'controlled'; kind?: 'single' | 'multiple'; value: readonly Id[] }>;
export type ChartSelectionChange<Id extends ChartDatumId = ChartDatumId> = Readonly<{
  selection: readonly Id[]; effect: 'proposal' | 'accepted';
  source: 'pointer' | 'touch' | 'keyboard' | 'api' | 'update'; revision: number;
}>;
export type ChartCrosshair = false | 'x' | 'y' | 'xy';
