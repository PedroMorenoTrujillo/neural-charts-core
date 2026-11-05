import type {PlanRelationshipSpec, PlanRelationshipMetadata} from '../../../src/plan.js';

export interface RelationshipObservationPort {readonly relationship?: PlanRelationshipMetadata; readonly incomplete?: boolean; readonly value: number;}
export interface RelationshipDetail {readonly label: string; readonly value: string;}
export function relationshipNumber(value: number, format: (value: number) => string): string {
  const text = format(value);
  return value !== 0 && (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e15 || /^[+−-]?0(?:[.,\s]0+)*$/.test(text.trim()))
    ? value.toExponential(6).replace(/\.?(0+)(?=e)/, '') : text;
}
export function relationshipPrimaryLabel(observation: RelationshipObservationPort, locale: 'en' | 'es'): string | undefined {
  if (observation.relationship?.type === 'node') return locale === 'es' ? 'Total incidente conocido' : 'Known incident total';
  if (observation.relationship?.type === 'link') return locale === 'es' ? 'Valor de la relación' : 'Relation value';
  return undefined;
}
export function relationshipDetails(observation: RelationshipObservationPort, family: PlanRelationshipSpec['family'], locale: 'en' | 'es', format: (value: number) => string): readonly RelationshipDetail[] {
  const metadata = observation.relationship, es = locale === 'es', details: RelationshipDetail[] = [];
  if (!metadata) return details;
  if (metadata.type === 'node') {
    if (family === 'dependencywheel') details.push(
      {label: es ? 'Entrada conocida' : 'Known incoming', value: relationshipNumber(metadata.incoming, format)},
      {label: es ? 'Salida conocida' : 'Known outgoing', value: relationshipNumber(metadata.outgoing, format)},
    );
    if (observation.incomplete) details.push({label: es ? 'Datos' : 'Data', value: es ? 'Total incompleto: hay relaciones con valor desconocido' : 'Incomplete total: some relation values are unknown'});
  } else details.push(
    {label: metadata.directed ? es ? 'Origen' : 'From' : es ? 'Extremo A' : 'Endpoint A', value: metadata.fromLabel},
    {label: metadata.directed ? es ? 'Destino' : 'To' : es ? 'Extremo B' : 'Endpoint B', value: metadata.toLabel},
  );
  if (metadata.geometryOmitted) details.push({label: es ? 'Representación' : 'Representation', value: observation.value === 0
    ? es ? 'Valor cero sin área inventada' : 'Zero value without invented area'
    : es ? 'Inferior a la precisión geométrica; el valor original se conserva' : 'Below geometric precision; original value preserved'});
  return details;
}
