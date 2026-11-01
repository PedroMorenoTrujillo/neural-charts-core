/** Numeric coordinates and UTC timestamps are distinct source contracts. */
export type PlanTemporalAxis = Readonly<{
  kind: 'linear';
  domain?: readonly [number, number];
  reversed?: boolean;
  nice?: boolean;
  includeZero?: boolean;
  unit?: string;
}> | Readonly<{
  kind: 'time';
  domain?: readonly [number, number];
  reversed?: boolean;
  nice?: boolean;
  includeZero?: never;
  unit?: never;
}>;
