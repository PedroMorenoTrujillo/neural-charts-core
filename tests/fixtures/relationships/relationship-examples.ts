import type {PlanRelationshipSpec, PlanRelationshipNode, PlanRelationshipLink, PlanHierarchyGroup} from '../../../src/plan.js';

export type RelationshipFamily = PlanRelationshipSpec['family'];
export type RelationshipExampleId = 'basic' | 'groups' | 'layout' | 'missing' | 'zero' | 'precision';
type Locale = 'en' | 'es';
const local = <T>(locale: Locale, en: T, es: T): T => locale === 'es' ? es : en;

const sourceEn = 'Stable nodes and link IDs, explicit endpoints and non-negative measured values. null is unknown; zero is known. Visibility groups are optional. Unknown links stay in the source table; node totals disclose incomplete data.';
const sourceEs = 'Nodos e IDs de enlace estables, extremos explícitos y valores medidos no negativos. null es desconocido; cero es conocido. Los grupos de visibilidad son opcionales. Los enlaces desconocidos permanecen en la tabla original; los totales de nodo indican si faltan valores.';
const limitsEn = 'Up to 64 nodes, 256 links and 15 explicit groups plus the default group. Node and link IDs are globally unique. Self-links, axes, stacking, references and viewport transforms are not supported in this version.';
const limitsEs = 'Hasta 64 nodos, 256 enlaces y 15 grupos explícitos más el grupo predeterminado. Los IDs de nodos y enlaces son únicos en todo el gráfico. Esta versión no admite enlaces al mismo nodo, ejes, apilado, referencias ni transformaciones de zoom.';
export const relationshipCopy = {
  en: {
    dependencywheel: {name: 'Dependency wheel', description: 'Directed weighted relations arranged around a ring.', when: 'Use it to compare incoming and outgoing relations, including cycles. Sector size uses the known incident total; incomplete totals are identified explicitly.', data: sourceEn, compatibility: limitsEn},
    arcdiagram: {name: 'Arc diagram', description: 'Ordered nodes joined by weighted undirected arcs.', when: 'Use it when source node order matters. Arc thickness represents relation weight. Node radius is a layout choice, not a second measure.', data: sourceEn, compatibility: limitsEn},
    chord: {name: 'Chord diagram', description: 'Undirected weighted relations with genuine shared radial ports.', when: 'Use it for symmetric connections and collaboration. Endpoint order does not imply direction; the tooltip reports incident totals rather than incoming and outgoing values.', data: sourceEn, compatibility: limitsEn},
  },
  es: {
    dependencywheel: {name: 'Rueda de dependencias', description: 'Relaciones dirigidas y ponderadas alrededor de un anillo.', when: 'Úsala para comparar relaciones entrantes y salientes, incluidos los ciclos. El tamaño del sector representa el total incidente conocido e indica si está incompleto.', data: sourceEs, compatibility: limitsEs},
    arcdiagram: {name: 'Diagrama de arcos', description: 'Nodos ordenados unidos por arcos no dirigidos y ponderados.', when: 'Úsalo cuando importa el orden de los nodos de origen. El grosor del arco representa el peso de la relación; el radio del nodo es una opción visual.', data: sourceEs, compatibility: limitsEs},
    chord: {name: 'Diagrama de cuerdas', description: 'Relaciones no dirigidas con puertos radiales compartidos reales.', when: 'Úsalo para conexiones simétricas y colaboración. El orden de los extremos no implica dirección; el tooltip muestra el total incidente, sin entradas ni salidas.', data: sourceEs, compatibility: limitsEs},
  },
} as const;

export interface RelationshipExample {readonly id: RelationshipExampleId; readonly name: string; readonly description: string;}
export function relationshipExamples(family: RelationshipFamily, locale: Locale): readonly RelationshipExample[] {
  return [
    {id: 'basic', name: local(locale, 'Measured relations', 'Relaciones medidas'), description: local(locale, 'Stable source identities and real weighted links, including a cycle.', 'Identidades originales estables y enlaces ponderados reales, incluido un ciclo.')},
    {id: 'groups', name: local(locale, 'Visibility groups', 'Grupos de visibilidad'), description: local(locale, 'Hide and restore a source group; visible incident totals and weights are recomputed.', 'Oculta y restaura un grupo de origen; los totales y pesos visibles se vuelven a calcular.')},
    {id: 'layout', name: family === 'arcdiagram' ? local(locale, 'Reversed arc layout', 'Arcos invertidos') : local(locale, 'Rotation and ring width', 'Rotación y ancho de anillo'), description: family === 'arcdiagram' ? local(locale, 'Mirror the arcs without changing source order, identities or values.', 'Invierte los arcos sin cambiar el orden original, las identidades ni los valores.') : local(locale, 'Change the starting angle, gap and ring width without changing measured relations.', 'Cambia el ángulo inicial, la separación y el ancho del anillo sin modificar las relaciones medidas.')},
    {id: 'missing', name: local(locale, 'Unknown relation values', 'Valores de relación desconocidos'), description: local(locale, 'Unknown links are retained in the source alternative; known totals disclose incompleteness.', 'Los enlaces desconocidos se conservan en la alternativa de datos; los totales conocidos indican si están incompletos.')},
    {id: 'zero', name: local(locale, 'Known zero', 'Cero conocido'), description: local(locale, 'Zero nodes remain markers. Zero-weight links have no invented area and remain available through navigation and source data.', 'Los nodos de valor cero siguen como marcadores. Los enlaces de peso cero no reciben área inventada y se conservan en la navegación y los datos originales.')},
    {id: 'precision', name: local(locale, 'Very different scales', 'Escalas muy diferentes'), description: local(locale, 'Tiny source values are preserved. Hide the large group to inspect the small relations at their own visible scale.', 'Los valores originales diminutos se conservan. Oculta el grupo grande para explorar las relaciones pequeñas a su escala visible.')},
  ];
}

export function relationshipExampleSpec(family: RelationshipFamily, example: RelationshipExampleId, locale: Locale): PlanRelationshipSpec {
  let nodes: readonly PlanRelationshipNode[] = [
    {id: 'a', label: local(locale, 'Applications', 'Aplicaciones'), groupId: 'connections'},
    {id: 'b', label: local(locale, 'Services', 'Servicios'), groupId: 'connections'},
    {id: 'c', label: local(locale, 'Analytics', 'Analítica'), groupId: 'connections'},
  ];
  let links: readonly PlanRelationshipLink[] = [
    {id: 'ab', from: 'a', to: 'b', value: 12}, {id: 'bc', from: 'b', to: 'c', value: 8}, {id: 'ca', from: 'c', to: 'a', value: 4},
  ];
  let groups: readonly PlanHierarchyGroup[] = [{id: 'connections', label: local(locale, 'Connections', 'Conexiones')}];
  if (example === 'groups') {
    groups = [{id: 'product', label: local(locale, 'Product', 'Producto')}, {id: 'operations', label: local(locale, 'Operations', 'Operaciones')}];
    nodes = [
      {id: 'a', label: local(locale, 'Application', 'Aplicación'), groupId: 'product'},
      {id: 'b', label: local(locale, 'Support', 'Soporte'), groupId: 'product'},
      {id: 'c', label: local(locale, 'Delivery', 'Entrega'), groupId: 'operations'},
      {id: 'd', label: local(locale, 'Monitoring', 'Supervisión'), groupId: 'operations'},
    ];
    links = [{id: 'ab', from: 'a', to: 'b', value: 6}, {id: 'bc', from: 'b', to: 'c', value: 10}, {id: 'cd', from: 'c', to: 'd', value: 4}, {id: 'da', from: 'd', to: 'a', value: 7}];
  }
  if (example === 'missing') links = [{id: 'ab', from: 'a', to: 'b', value: 12}, {id: 'bc', from: 'b', to: 'c', value: null}, {id: 'ca', from: 'c', to: 'a', value: 0}];
  if (example === 'zero') links = links.map(link => ({...link, value: 0}));
  if (example === 'precision') {
    groups = [{id: 'large', label: local(locale, 'Large scale', 'Escala grande')}, {id: 'small', label: local(locale, 'Small scale', 'Escala pequeña')}];
    nodes = [{id: 'a', label: 'A', groupId: 'large'}, {id: 'b', label: 'B', groupId: 'large'}, {id: 'c', label: 'C', groupId: 'small'}, {id: 'd', label: 'D', groupId: 'small'}];
    links = [{id: 'large-relation', from: 'a', to: 'b', value: 1e308}, {id: 'tiny-relation', from: 'c', to: 'd', value: 1e-15}];
  }
  const info = relationshipExamples(family, locale).find(item => item.id === example)!;
  const base = {title: relationshipCopy[locale][family].name, description: info.description, nodes, links, groups};
  if (family === 'arcdiagram') return {...base, family, ...(example === 'layout' ? {reversed: true, nodeRadius: 9, linkWidth: 18} : {})};
  return {...base, family, ...(example === 'layout' ? {startAngle: family === 'chord' ? -90 : 125, nodePadding: 6, nodeWidth: 20} : {})};
}
