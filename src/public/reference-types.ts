/** Inclusive ordered category IDs, or a strictly ascending numeric/time range.
 * Ranges decorate the displayed domain; they never enlarge it or change data. */
export type ChartReferenceBand<TX extends string | number = string | number, TY extends string | number = number> =
  Readonly<{ id: string; label?: string; color?: string; opacity?: number }> & (
    | Readonly<{ axis: 'x'; from: TX; to: TX }>
    | Readonly<{ axis: 'y'; from: TY; to: TY }>
  );
