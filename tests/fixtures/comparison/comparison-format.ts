interface BulletPort {readonly type: 'measure' | 'target'; readonly measure: number | null; readonly target?: number | null;}
interface VariwidePort {readonly z: number; readonly share: number; readonly zeroWidth: boolean; readonly geometryOmitted: boolean;}
export interface ComparisonObservationPort {readonly bullet?: BulletPort; readonly variwide?: VariwidePort;}
export interface ComparisonDetail {readonly label: string; readonly value: string;}

/** Preserve known non-zero extremes when ordinary fixed precision would print zero. */
export function comparisonNumber(value: number, format: (value: number) => string): string {
  const formatted = format(value);
  const roundedToZero = /^[+−-]?0(?:[.,\s]0+)*$/.test(formatted.trim());
  return value !== 0 && (roundedToZero || Math.abs(value) < .000001 || Math.abs(value) >= 1e15) ? value.toExponential(6).replace(/\.?(0+)(?=e)/, '') : formatted;
}

export function comparisonPrimaryLabel(observation: ComparisonObservationPort, locale: 'en' | 'es'): string | undefined {
  return observation.bullet?.type === 'target' ? locale === 'es' ? 'Objetivo' : 'Target' : undefined;
}

export function comparisonDetails(observation: ComparisonObservationPort, locale: 'en' | 'es', format: (value: number) => string): readonly ComparisonDetail[] {
  const es = locale === 'es', unknown = es ? 'Desconocido' : 'Unknown', details: ComparisonDetail[] = [];
  if (observation.bullet) {
    const bullet = observation.bullet;
    if (bullet.type === 'target') details.push({label: es ? 'Medida' : 'Measure', value: bullet.measure === null ? unknown : comparisonNumber(bullet.measure, format)});
    if (bullet.type !== 'target' && bullet.target !== undefined) details.push({label: es ? 'Objetivo' : 'Target', value: bullet.target === null ? unknown : comparisonNumber(bullet.target, format)});
  }
  if (observation.variwide) {
    const width = observation.variwide;
    details.push({label: es ? 'Ancho original' : 'Source width', value: comparisonNumber(width.z, format)});
    details.push({label: es ? 'Proporción del ancho' : 'Width share', value: width.z > 0 && width.share === 0 ? es ? 'Inferior a la precisión de representación' : 'Below representable precision' : comparisonNumber(width.share * 100, format) + '%'});
    if (width.geometryOmitted) details.push({label: es ? 'Representación' : 'Representation', value: width.zeroWidth ? es ? 'Marcador de ancho cero' : 'Zero-width marker' : es ? 'Marcador por límite de precisión' : 'Precision-limit marker'});
  }
  return details;
}
