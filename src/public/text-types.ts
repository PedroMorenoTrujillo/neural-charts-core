import type { ChartResult } from './chart-types.js';

export type ChartNumberFormat = Readonly<{
  notation?: 'standard' | 'scientific' | 'compact'; useGrouping?: boolean;
  precision?: Readonly<{ kind: 'fraction' | 'significant'; digits: number }>;
}> & (Readonly<{ style?: 'decimal' | 'percent'; currency?: never; unit?: never }>
  | Readonly<{ style: 'currency'; currency: string; unit?: never }>
  | Readonly<{ style: 'unit'; unit: string; currency?: never }>);
export type ChartTimeTextPrecision = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond' | 'full';
export type ChartFormattedText = Readonly<{ text: string; raw: string }>;
export type ChartMessageKey =
  | 'chartData' | 'pointDetails' | 'viewDataTable' | 'dataTable' | 'closeDataTable' | 'previousPage' | 'nextPage'
  | 'dataHeading' | 'originalObservations' | 'pageAnnouncement' | 'croppedRetained' | 'scrollHorizontally' | 'keyboardCartesian'
  | 'missingObservation' | 'noSample' | 'noData' | 'loadingData' | 'noVisibleSeries' | 'noVisibleSlices' | 'seriesVisible' | 'seriesHidden'
  | 'series' | 'x' | 'y' | 'value' | 'visibility' | 'selected' | 'slice' | 'visibleShare' | 'row' | 'column' | 'observation'
  | 'node' | 'path' | 'total' | 'knownTotal' | 'percentage' | 'originalValue'
  | 'reference' | 'referenceRange' | 'referenceInclusive' | 'referenceRanges' | 'outsideDomain' | 'outsideRange'
  | 'zoomIn' | 'zoomOut' | 'resetZoom' | 'panLeft' | 'panRight' | 'panUp' | 'panDown'
  | 'selectionSummary' | 'viewportSummary' | 'viewportAxis';
/** A consumer can share a partial language dictionary between chart families. */
export type ChartMessages = Readonly<Partial<Record<ChartMessageKey, string>>>;
export type ChartMessageArguments = Readonly<Record<string, string | number>>;
export type ChartTextConfig = Readonly<{ locale?: string; timeZone?: string; messages?: ChartMessages }>;
export type ChartTextContext = Readonly<{
  locale: string | null; timeZone: string; localizedTime: boolean;
  number(value: number, format?: ChartNumberFormat): ChartResult<ChartFormattedText>;
  time(value: number, precision?: ChartTimeTextPrecision): ChartResult<ChartFormattedText>;
  message(key: ChartMessageKey, args?: ChartMessageArguments): ChartResult<string>;
}>;
