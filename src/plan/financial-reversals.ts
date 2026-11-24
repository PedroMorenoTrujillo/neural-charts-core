import type {NullableValues} from './financial-statistics.js';

export function rangeZigzag(high: NullableValues, low: NullableValues, threshold: number): NullableValues {
  const output = Array<number | null>(high.length).fill(null);
  const reached = (value: number, extreme: number, direction: 1 | -1) => {
    const movement = (value - extreme) * direction;
    return movement > 0 && movement >= Math.abs(extreme) * threshold / 100;
  };
  let start = -1, candidate = -1;
  let searching: 0 | 1 | -1 = 0;
  const record = () => {
    if (candidate >= 0) output[candidate] = (searching === 1 ? low : high)[candidate]!;
  };

  for (let i = 0; i < high.length; i++) {
    const hi = high[i], lo = low[i];
    if (hi == null || lo == null) {
      if (candidate >= 0 && output[candidate] === null) record();
      start = candidate = -1;
      searching = 0;
      continue;
    }
    if (start < 0) {
      start = i;
      continue;
    }
    if (searching === 0) {
      if (reached(lo, high[start]!, -1)) {
        output[start] = high[start]!;
        searching = 1;
      } else if (reached(hi, low[start]!, 1)) {
        output[start] = low[start]!;
        searching = -1;
      } else continue;
      candidate = i;
    }

    if (searching === 1) {
      if (lo <= low[candidate]!) candidate = i;
      if (!reached(hi, low[candidate]!, 1)) continue;
    } else {
      if (hi >= high[candidate]!) candidate = i;
      if (!reached(lo, high[candidate]!, -1)) continue;
    }
    record();
    searching = searching === 1 ? -1 : 1;
    candidate = i;
  }
  if (candidate >= 0 && output[candidate] === null) record();
  return output;
}

export function twoSessionSar(high: NullableValues, low: NullableValues): NullableValues {
  const output = Array<number | null>(high.length).fill(null);
  const round = (value: number, precision: number) => Number(value.toFixed(precision));
  let run = 0, rising = true, previouslyRising = true, extreme = 0, sar = 0, acceleration = .02;

  for (let i = 0; i < high.length; i++) {
    const hi = high[i], lo = low[i];
    if (hi == null || lo == null) {
      run = 0;
      continue;
    }
    if (++run <= 2) continue;
    if (run === 3) {
      extreme = Math.max(high[i-1]!, high[i-2]!);
      sar = Math.min(low[i-1]!, round(low[i-2]!, 4));
      rising = hi > sar;
      previouslyRising = true;
      acceleration = .02;
    } else {
      const projected = sar + acceleration * (extreme - sar);
      sar = rising !== previouslyRising ? extreme : rising
        ? Math.min(projected, low[i-1]!, low[i-2]!)
        : Math.max(projected, high[i-1]!, high[i-2]!);
      const nextExtreme = rising ? Math.max(hi, extreme) : Math.min(lo, extreme);
      const nextRising: boolean = (previouslyRising ? lo : hi) > sar;
      if (rising !== nextRising) acceleration = .02;
      else if (nextExtreme !== extreme) acceleration = Math.min(.2, round(acceleration + .02, 2));
      previouslyRising = rising;
      rising = nextRising;
      extreme = nextExtreme;
    }
    output[i] = round(sar, 4);
  }
  return output;
}
