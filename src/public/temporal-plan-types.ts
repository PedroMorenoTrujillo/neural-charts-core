/** Numeric coordinates and UTC timestamps are distinct source contracts. */
export type PlanTemporalAxis = Readonly<{
  type: 'linear';
  domain?: readonly [number, number];
  reversed?: boolean;
  nice?: boolean;
  includeZero?: boolean;
  unit?: string;
}> | Readonly<{
  type: 'time';
  domain?: readonly [number, number];
  reversed?: boolean;
  nice?: boolean;
  includeZero?: never;
  unit?: never;
}>;
