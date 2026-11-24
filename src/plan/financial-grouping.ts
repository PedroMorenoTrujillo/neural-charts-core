import type {PlanFinancialPoint} from '../public/financial-plan-types.js';

const day = 86_400_000;
const interval = {minute: 60_000, hour: 3_600_000, day, week: 7 * day} as const;
const dateLimit = 8.64e15;

export type FinancialGroupingUnit = keyof typeof interval | 'month';
export interface FinancialOhlcBucket {
  readonly point: PlanFinancialPoint;
  readonly sourceIds: readonly string[];
}

function bucketStart(time: number, unit: FinancialGroupingUnit): number {
  if (unit === 'month') {
    const date = new Date(time);
    date.setUTCDate(1);
    return date.setUTCHours(0, 0, 0, 0);
  }
  const span = interval[unit];
  const origin = unit === 'week' ? 4 * day : 0;
  return Math.floor((time - origin) / span) * span + origin;
}

/** UTC buckets with original IDs. Empty buckets are omitted. All-gap buckets remain gaps. */
export function groupFinancialOhlc(
  data: readonly PlanFinancialPoint[],
  unit: FinancialGroupingUnit,
): readonly FinancialOhlcBucket[] {
  if (unit !== 'month' && !Object.hasOwn(interval, unit)) throw new RangeError('Unsupported financial grouping unit');
  if (!Array.isArray(data) || data.length > 100_000) throw new RangeError('Financial grouping input limit');

  let previous = -Infinity;
  let start = -Infinity;
  let open: number | null = null, high: number | null = null, low: number | null = null;
  let close: number | null = null, volume: number | null = null;
  let sourceIds: string[] = [];
  const ids = new Set<string>();
  const buckets: FinancialOhlcBucket[] = [];
  const finish = () => {
    if (!sourceIds.length) return;
    const point = Object.freeze({id: 'bucket:' + start, x: start, open, high, low, close, volume});
    buckets.push(Object.freeze({point, sourceIds: Object.freeze(sourceIds)}));
  };

  for (const point of data) {
    if (!point || typeof point.id !== 'string' || !point.id || point.id.length > 64 || ids.has(point.id) ||
        !Number.isInteger(point.x) || Math.abs(point.x) > dateLimit || point.x <= previous) {
      throw new RangeError('Expected unique, ordered financial observations within the Date range');
    }
    ids.add(point.id);
    previous = point.x;
    const time = bucketStart(point.x, unit);
    if (!Number.isFinite(time) || Math.abs(time) > dateLimit) throw new RangeError('Financial bucket outside Date range');
    if (time !== start) {
      finish();
      start = time;
      open = high = low = close = volume = null;
      sourceIds = [];
    }
    sourceIds.push(point.id);
    const amount = point.volume;
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) throw new RangeError('Invalid financial volume');
    if (point.close === null && point.open === null && point.high === null && point.low === null) continue;
    const o = point.open, h = point.high, l = point.low, c = point.close;
    if (o === null || h === null || l === null || c === null ||
        ![o,h,l,c].every(Number.isFinite) || h < Math.max(o,c) || l > Math.min(o,c)) throw new RangeError('Invalid OHLC observation');
    open ??= o;
    close = c;
    high = high === null ? h : Math.max(high,h);
    low = low === null ? l : Math.min(low,l);
    if (amount != null) {
      volume = (volume ?? 0) + amount;
      if (!Number.isFinite(volume)) throw new RangeError('Financial bucket volume overflow');
    }
  }
  finish();
  return Object.freeze(buckets);
}
