export function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
export function normalizeZero(value: number): number { return value === 0 ? 0 : value; }
const bits = new DataView(new ArrayBuffer(8));
export function nextUp(value: number): number {
  if (Number.isNaN(value) || value === Infinity) return value;
  if (value === 0) return Number.MIN_VALUE;
  bits.setFloat64(0, value);
  const integer = bits.getBigUint64(0);
  bits.setBigUint64(0, value > 0 ? integer + 1n : integer - 1n);
  return bits.getFloat64(0);
}
export function nextDown(value: number): number { return -nextUp(-value); }
export function ulp(value: number): number {
  if (!isFiniteNumber(value)) return NaN; // Private numeric sentinel, never an emitted coordinate.
  const up = nextUp(value), down = nextDown(value);
  return Math.max(Number.isFinite(up) ? up - value : 0, Number.isFinite(down) ? value - down : 0);
}
export function approximatelyEqual(a: number, b: number, absoluteTolerance = 0, relativeTolerance = 32 * Number.EPSILON): boolean {
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) return false;
  if (a === b) return true;
  const difference = Math.abs(a - b);
  return Number.isFinite(difference) && difference <= Math.max(absoluteTolerance, relativeTolerance * Math.max(Math.abs(a), Math.abs(b)));
}
