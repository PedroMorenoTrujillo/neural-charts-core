import { isFiniteNumber } from './finite.js';
export const MIN_DATE = -8_640_000_000_000_000, MAX_DATE = 8_640_000_000_000_000;
export type UtcUnit = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
export type UtcInterval = Readonly<{ unit: UtcUnit; step: number }>;
const steps: Readonly<Record<UtcUnit, readonly number[]>> = {
  millisecond: [1,2,5,10,20,50,100,200,500], second: [1,2,5,10,15,30], minute: [1,2,5,10,15,30], hour: [1,2,3,6,12], day: [1,2], week: [1,2], month: [1,3,6],
  year: [1,2,5,10,20,50,100,200,500,1000,2000,5000,10000,20000,50000,100000,200000,500000,1000000]
};
export const UTC_INTERVALS: readonly UtcInterval[] = Object.freeze((Object.keys(steps) as UtcUnit[]).flatMap(unit => steps[unit].map(step => Object.freeze({ unit, step }))));
export const isTimestamp = (n: unknown): n is number => isFiniteNumber(n) && Number.isInteger(n) && n >= MIN_DATE && n <= MAX_DATE;
export const validInterval = (interval: UtcInterval): boolean => !!interval && typeof interval==='object' && !Array.isArray(interval) && typeof interval.unit==='string' && Object.hasOwn(steps,interval.unit) && isFiniteNumber(interval.step) && steps[interval.unit].includes(interval.step);
const durations: Partial<Record<UtcUnit, number>> = { millisecond:1, second:1000, minute:60000, hour:3600000, day:86400000, week:604800000 };
function floorDiv(n: bigint, d: bigint): bigint { const q = n / d; return n < 0n && n % d !== 0n ? q - 1n : q; }
function indexAt(t: number, interval: UtcInterval): bigint {
  const duration = durations[interval.unit];
  if (duration) return floorDiv(BigInt(t) - (interval.unit === 'week' ? -259200000n : 0n), BigInt(duration * interval.step));
  const date = new Date(t), year = date.getUTCFullYear();
  return BigInt(Math.floor((interval.unit === 'month' ? year * 12 + date.getUTCMonth() : year) / interval.step));
}
function materialize(index: bigint, interval: UtcInterval): number | null {
  const duration = durations[interval.unit];
  if (duration) {
    const v = index * BigInt(duration * interval.step) + (interval.unit === 'week' ? -259200000n : 0n);
    return v >= BigInt(MIN_DATE) && v <= BigInt(MAX_DATE) ? Number(v) : null;
  }
  const total = Number(index) * interval.step;
  const year = interval.unit === 'month' ? Math.floor(total / 12) : total;
  const month = interval.unit === 'month' ? total - year * 12 : 0;
  const date = new Date(0); date.setUTCFullYear(year, month, 1); date.setUTCHours(0,0,0,0);
  const t = date.getTime();
  return isTimestamp(t) && date.getUTCFullYear() === year && date.getUTCMonth() === month ? t : null;
}
export function floorUtc(t: number, interval: UtcInterval): number | null {
  return isTimestamp(t) && validInterval(interval) ? materialize(indexAt(t, interval), interval) : null;
}
export function advanceUtc(boundary: number, interval: UtcInterval): number | null {
  if (!isTimestamp(boundary) || !validInterval(interval)) return null;
  const index = indexAt(boundary, interval);
  if (materialize(index, interval) !== boundary) return null;
  const next = materialize(index + 1n, interval);
  return next !== null && next > boundary ? next : null;
}
export function enumerateUtc(lo: number, hi: number, interval: UtcInterval, nice: boolean): readonly number[] | null {
  if (!isTimestamp(lo) || !isTimestamp(hi) || lo > hi || !validInterval(interval)) return null;
  let first = indexAt(lo, interval), last = indexAt(hi, interval);
  const flo = materialize(first, interval), fhi = materialize(last, interval);
  if (!nice && flo !== lo) first++;
  if (nice && fhi !== hi) last++;
  const count = last - first + 1n;
  if (count < 0n || count > 200n) return null;
  const ticks: number[] = [];
  for (let i = 0n; i < count; i++) {
    const t = materialize(first + i, interval);
    if (t === null || (ticks.length > 0 && t <= ticks[ticks.length - 1]!)) return null;
    ticks.push(t);
  }
  return Object.freeze(ticks);
}
