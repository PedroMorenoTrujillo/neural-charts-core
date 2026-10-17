/** Mathematical values keep their sign, exponent and percent suffix order.
 * Chart layout and domain order remain independent of this text direction. */
export const NUMERIC_LABEL_CLASS = 'nc-owned-data-label';
export const NUMERIC_AXIS_CLASS = 'nc-owned-axis-number';
export function numericLabelCss(scope: string): string { return `${scope} .${NUMERIC_LABEL_CLASS},${scope} .${NUMERIC_AXIS_CLASS}{direction:ltr;unicode-bidi:isolate;}`; }
/** Exported drawings cannot rely on the live chart's scoped stylesheet. */
export function isolateNumericLabels(geometry: SVGElement): void {
  for (const element of geometry.querySelectorAll('text.' + NUMERIC_LABEL_CLASS + ',text.' + NUMERIC_AXIS_CLASS)) { element.setAttribute('direction', 'ltr'); element.setAttribute('unicode-bidi', 'isolate'); }
}
