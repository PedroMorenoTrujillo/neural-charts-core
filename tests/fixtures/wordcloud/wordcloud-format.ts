import type {PlanWordCloudNotDisplayedReason} from '../../../src/plan.js';

export function wordcloudWeight(value: number, format: (value: number) => string): string {
  const result = format(value);
  return value !== 0 && (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e15 || /^[+−-]?0(?:[.,\s]0+)*$/.test(result.trim()))
    ? value.toExponential(6).replace(/\.?(0+)(?=e)/, '') : result;
}
export function wordcloudSourceReason(reason: PlanWordCloudNotDisplayedReason, locale: 'en' | 'es'): string {
  const labels = {
    en: {hidden: 'Hidden source group', unknown: 'Unknown weight', zero: 'Known zero', budget: 'Outside the selected candidates', noInk: 'Text has no visible area', noSpace: 'Does not fit these text settings'},
    es: {hidden: 'Grupo de origen oculto', unknown: 'Peso desconocido', zero: 'Cero conocido', budget: 'Fuera de las candidatas seleccionadas', noInk: 'Texto sin área visible', noSpace: 'No cabe con esta configuración de texto'},
  } as const;
  return labels[locale][reason];
}
