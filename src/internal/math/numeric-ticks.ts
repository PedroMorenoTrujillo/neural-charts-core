import { invalid, ok } from '../diagnostics.js';
import type { Result } from '../diagnostics.js';
import { validDomain } from './domain.js';
import type { Domain } from './domain.js';
import { isFiniteNumber, normalizeZero, ulp } from './finite.js';
export type TickPlan = Readonly<{ domain: Domain; ticks: readonly number[]; step: number | null; fallback: boolean }>;
export type TickOptions = Readonly<{ targetCount?: number; nice: boolean; manual?: readonly number[] }>;
type Decimal = { c: bigint; e: number };
function decimal(n: number): Decimal {
  const [base = '', exponent = '0'] = String(n).toLowerCase().split('e');
  const dot = base.indexOf('.');
  return { c: BigInt(base.replace('.', '')), e: Number(exponent) - (dot < 0 ? 0 : base.length - dot - 1) };
}
const power = (n: number): bigint => 10n ** BigInt(n);
function floor(n: bigint, d: bigint): bigint { const q = n / d; return n < 0n && n % d !== 0n ? q - 1n : q; }
const ceil = (n: bigint, d: bigint): bigint => -floor(-n, d);
function canonical(c: bigint, e: number): Decimal { while (c % 10n === 0n) { c /= 10n; e++; } return { c, e }; }
export function validateTickOptions(domain: Domain, options: TickOptions): Result<number> {
  if (!validDomain(domain)) return invalid('INVALID_DOMAIN', 'REVERSED', 'domain');
  const target = options.targetCount ?? 6;
  if (!Number.isInteger(target) || target < 2 || target > 12 || ('targetCount' in options && options.targetCount === undefined)) return invalid('INVALID_CONFIG', 'BAD_TICK_TARGET', 'targetCount');
  if (typeof options.nice !== 'boolean' || ('manual' in options && options.manual === undefined) || (options.manual && options.nice)) return invalid('INVALID_CONFIG', 'BAD_TICK_OPTIONS', 'ticks');
  if (options.manual) {
    if (!Array.isArray(options.manual) || options.manual.length > 200) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'ticks');
    for (let i = 0; i < options.manual.length; i++) {
      const v = options.manual[i];
      if (!isFiniteNumber(v)) return invalid('INVALID_NUMBER', 'NONFINITE', `ticks[${i}]`);
      if (v < domain[0] || v > domain[1] || (i > 0 && v <= options.manual[i - 1]!)) return invalid('INVALID_CONFIG', 'BAD_MANUAL_TICKS', `ticks[${i}]`);
    }
  }
  return ok(target);
}
export function selectNumericTicks(domain: Domain, options: TickOptions): Result<TickPlan> {
  const validated = validateTickOptions(domain, options);
  if (validated.status === 'invalid') return validated;
  const frozenDomain = Object.freeze([...domain]) as Domain;
  if (options.manual) return ok(Object.freeze({ domain: frozenDomain, ticks: Object.freeze(options.manual.map(normalizeZero)), step: null, fallback: false }));
  const a = decimal(domain[0]), b = decimal(domain[1]);
  const e = Math.min(a.e, b.e);
  const ac = a.c * power(a.e - e), bc = b.c * power(b.e - e), span = bc - ac;
  const divisor = BigInt(validated.value - 1);
  let k = span.toString().length - divisor.toString().length + e;
  const comparePower = (exponent: number): boolean => exponent >= e ? span >= divisor * power(exponent - e) : span * power(e - exponent) >= divisor;
  while (!comparePower(k)) k--;
  while (comparePower(k + 1)) k++;
  let best: { plan: TickPlan; error: number; expansion: bigint; rank: number; step: number; exponent: number } | undefined;
  const seen = new Set<string>();
  for (let j = k - 1; j <= k + 1; j++) for (const [m, shift, rank] of [[1n, 0, 0], [2n, 0, 1], [25n, -1, 3], [5n, 0, 2], [10n, 0, 0]] as const) {
    const q = canonical(m, j + shift), key = `${q.c}:${q.e}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const step = Number(`${q.c}e${q.e}`);
    if (!Number.isFinite(step) || step === 0 || step < Math.max(ulp(domain[0]), ulp(domain[1]))) continue;
    const common = Math.min(e, q.e), aa = ac * power(e - common), bb = bc * power(e - common), qq = q.c * power(q.e - common);
    if (Math.max(aa.toString().length, bb.toString().length, qq.toString().length) > 2048) return invalid('INTERNAL_INVARIANT', 'DECIMAL_RESOURCE_LIMIT', 'ticks');
    const first = options.nice ? floor(aa, qq) : ceil(aa, qq), last = options.nice ? ceil(bb, qq) : floor(bb, qq), count = last - first + 1n;
    if (count < 2n || count > 200n) continue;
    const ticks: number[] = [];
    let valid = true;
    for (let i = 0n; i < count; i++) {
      const v = normalizeZero(Number(`${(first + i) * q.c}e${q.e}`));
      if (!Number.isFinite(v) || (ticks.length > 0 && v <= ticks[ticks.length - 1]!) || (!options.nice && (v < domain[0] || v > domain[1]))) { valid = false; break; }
      ticks.push(v);
    }
    if (!valid || (options.nice && (ticks[0]! > domain[0] || ticks[ticks.length - 1]! < domain[1]))) continue;
    const expansionRaw = options.nice ? aa - first * qq + last * qq - bb : 0n;
    const expansion = expansionRaw * power(common - Math.min(e, k - 2));
    const error = Math.abs(ticks.length - validated.value);
    const wins = !best || error < best.error || (error === best.error && (expansion < best.expansion || (expansion === best.expansion && (rank < best.rank || (rank === best.rank && step > best.step)))));
    if (wins) best = { plan: Object.freeze({ domain: options.nice ? Object.freeze([ticks[0]!, ticks[ticks.length - 1]!] as const) : frozenDomain, ticks: Object.freeze(ticks), step, fallback: false }), error, expansion, rank, step, exponent: common };
  }
  return ok(best?.plan ?? Object.freeze({ domain: frozenDomain, ticks: frozenDomain, step: null, fallback: true }));
}
