import type {PlanBulletSpec, PlanVariwideSpec} from '../../../src/plan.js';

type Locale = 'en' | 'es';
type ComparisonFamily = 'bullet' | 'variwide';
const local = <T>(locale: Locale, en: T, es: T): T => locale === 'es' ? es : en;

export const comparisonCopy = {
  en: {
    bullet: {name: 'Bullet', description: 'Compare a measurement with its target and qualitative ranges.',
      when: 'Use a bullet chart for compact goal tracking. The filled measure and the target share a numeric scale; background ranges provide context without adding series.',
      data: 'Each point has a stable id, a category id x and a measure y. The optional target is independent. null means unknown; zero remains a known value. Qualitative bands never affect the automatic numeric domain.',
      options: 'Choose horizontal or vertical layout, category/value reversal and spacing. Bands have explicit bounds, labels and colors. Bullet viewport gestures and stacking are not available.'},
    variwide: {name: 'Variwide', description: 'Compare heights while each category occupies its measured share of width.',
      when: 'Use variwide when category width carries a second quantity, such as capacity or population. A zero-width category remains selectable through a marker; a missing width is excluded from proportional allocation.',
      data: 'Each point has a stable id, category id x, numeric height y and non-negative width z. null is unknown. A known z still reserves its width when y is missing. All-zero or unknown widths produce an explicit empty proportional layout.',
      options: 'One measured series is supported. Configure spacing and category/value reversal. Numeric Y zoom is available; weighted X zoom and stacking are not available. No minimum visual width is fabricated for tiny quantities.'},
  },
  es: {
    bullet: {name: 'Bullet', description: 'Compara una medida con su objetivo y con rangos cualitativos.',
      when: 'Usa bullet para seguir objetivos en poco espacio. La medida rellena y su objetivo comparten escala numérica; los rangos de fondo aportan contexto sin añadir series.',
      data: 'Cada punto tiene un id estable, una categoría x y una medida y. El target opcional es independiente. null significa desconocido y cero sigue siendo un valor conocido. Las bandas cualitativas nunca cambian el dominio numérico automático.',
      options: 'Elige disposición horizontal o vertical, inversión de categorías y valores y separación. Las bandas tienen límites, etiquetas y colores explícitos. Bullet no admite gestos de zoom ni apilado.'},
    variwide: {name: 'Variwide', description: 'Compara alturas mientras cada categoría ocupa su proporción medida del ancho.',
      when: 'Usa variwide cuando el ancho de una categoría representa otra magnitud, como capacidad o población. Una categoría de ancho cero sigue siendo seleccionable mediante un marcador; un ancho desconocido se excluye del reparto proporcional.',
      data: 'Cada punto tiene un id estable, una categoría x, una altura numérica y y un ancho z no negativo. null significa desconocido. Un z conocido reserva su ancho aunque falte y. Si todos los anchos son cero o desconocidos, el reparto proporcional queda vacío de forma explícita.',
      options: 'Admite una serie de medidas. Configura separación e inversión de categorías y valores. Hay zoom numérico Y; no hay zoom X ponderado ni apilado. Las cantidades pequeñas no reciben un ancho mínimo inventado.'},
  },
} as const;

export const comparisonExamples = {
  bullet: [
    {id: 'basic', en: 'Measures and targets', es: 'Medidas y objetivos', enDescription: 'One series, three categories and three contextual ranges.', esDescription: 'Una serie, tres categorías y tres rangos de contexto.'},
    {id: 'vertical', en: 'Vertical layout', es: 'Disposición vertical', enDescription: 'The same measurements and targets on a vertical value scale.', esDescription: 'Las mismas medidas y objetivos sobre una escala de valores vertical.'},
    {id: 'grouped', en: 'Two measured series', es: 'Dos series de medidas', enDescription: 'Targets remain attached to their source points when hiding a series.', esDescription: 'Los objetivos siguen asociados a sus puntos al ocultar una serie.'},
    {id: 'missing', en: 'Unknown measures and targets', es: 'Medidas y objetivos desconocidos', enDescription: 'A known target remains accessible when its measure is unknown.', esDescription: 'Un objetivo conocido sigue siendo accesible cuando se desconoce su medida.'},
    {id: 'negative', en: 'Negative measures and exact zero', es: 'Medidas negativas y cero exacto', enDescription: 'Both signs and a target of zero retain their original values.', esDescription: 'Ambos signos y un objetivo de cero conservan sus valores originales.'},
    {id: 'reversed', en: 'Reversed numeric scale', es: 'Escala numérica invertida', enDescription: 'Direction changes without changing measures or target identities.', esDescription: 'Cambia la dirección sin modificar medidas ni identidades de los objetivos.'},
  ],
  variwide: [
    {id: 'basic', en: 'Height and measured width', es: 'Altura y ancho medido', enDescription: 'Output is the height; installed capacity determines each category width.', esDescription: 'La producción es la altura y la capacidad instalada determina el ancho de cada categoría.'},
    {id: 'equal', en: 'Equal source widths', es: 'Anchos originales iguales', enDescription: 'Equal widths come from equal z values, rather than a layout fallback.', esDescription: 'Los anchos iguales proceden de valores z iguales, no de un reparto artificial.'},
    {id: 'missing', en: 'Missing and zero values', es: 'Valores ausentes y cero', enDescription: 'Unknown width, unknown height and known zero remain different states.', esDescription: 'Ancho desconocido, altura desconocida y cero conocido siguen siendo estados distintos.'},
    {id: 'extremes', en: 'Extreme width ranges', es: 'Rangos extremos de ancho', enDescription: 'Very small widths keep their source value and an explicit marker when no bar area is representable.', esDescription: 'Los anchos muy pequeños conservan su valor original y un marcador explícito cuando su área no se puede representar.'},
    {id: 'reversed', en: 'Reversed categories', es: 'Categorías invertidas', enDescription: 'Widths remain proportional after reflecting the category axis.', esDescription: 'Los anchos mantienen su proporción al invertir el eje de categorías.'},
    {id: 'negative', en: 'Signed heights', es: 'Alturas con signo', enDescription: 'Width stays non-negative while heights can lie on either side of zero.', esDescription: 'El ancho sigue siendo no negativo mientras las alturas pueden estar a ambos lados de cero.'},
  ],
} as const;

export function comparisonExampleSpec(family: 'bullet', id: string, locale: Locale): PlanBulletSpec;
export function comparisonExampleSpec(family: 'variwide', id: string, locale: Locale): PlanVariwideSpec;
export function comparisonExampleSpec(family: ComparisonFamily, id: string, locale: Locale): PlanBulletSpec | PlanVariwideSpec {
  if (family === 'bullet') {
    const base: PlanBulletSpec = {family: 'bullet', title: local(locale, 'Delivery against targets', 'Entregas frente a objetivos'),
      description: local(locale, 'The filled measure and its target share one scale.', 'La medida rellena y su objetivo comparten escala.'),
      axes: {x: {kind: 'category', values: [{id: 'north', label: local(locale, 'North', 'Norte')}, {id: 'central', label: local(locale, 'Central', 'Centro')}, {id: 'south', label: local(locale, 'South', 'Sur')}]}, y: {kind: 'linear', domain: [0, 100], unit: '%'}},
      bands: [{id: 'below', from: 0, to: 50, label: local(locale, 'Needs attention', 'Requiere atención'), color: '#edf0f3'}, {id: 'progress', from: 50, to: 80, label: local(locale, 'Progressing', 'En progreso'), color: '#dce3eb'}, {id: 'goal', from: 80, to: 100, label: local(locale, 'On target', 'En objetivo'), color: '#c5d0de'}],
      series: [{id: 'delivered', name: local(locale, 'Delivered', 'Entregado'), color: '#2f6fcb', data: [{id: 'north-delivered', x: 'north', y: 72, target: 80}, {id: 'central-delivered', x: 'central', y: 89, target: 85}, {id: 'south-delivered', x: 'south', y: 44, target: 75}]}]};
    const row = base.series[0]!;
    if (id === 'vertical') return {...base, orientation: 'vertical'};
    if (id === 'grouped') return {...base, series: [...base.series, {...row, id: 'previous', name: local(locale, 'Previous period', 'Periodo anterior'), color: '#688f32', data: row.data.map(point => ({...point, id: `${point.id}-previous`, y: point.y! - 10}))}]};
    if (id === 'missing') return {...base, series: [{...row, data: [{...row.data[0]!, y: null, target: 80}, {...row.data[1]!, target: null}, {...row.data[2]!, y: 0, target: 0}]}]};
    if (id === 'negative') return {...base, axes: {...base.axes, y: {kind: 'linear', domain: [-50, 100], unit: '%'}}, bands: [{id: 'negative', from: -50, to: 0, color: '#f8e5e6'}, ...base.bands!], series: [{...row, data: [{...row.data[0]!, y: -25, target: 0}, {...row.data[1]!, y: 40, target: 60}, {...row.data[2]!, y: 0, target: -15}]}]};
    if (id === 'reversed') return {...base, axes: {...base.axes, y: {...base.axes.y, reversed: true}}};
    return base;
  }
  const base: PlanVariwideSpec = {family: 'variwide', title: local(locale, 'Output and installed capacity', 'Producción y capacidad instalada'),
    description: local(locale, 'Height represents output; width represents capacity.', 'La altura representa la producción y el ancho, la capacidad.'),
    axes: {x: {kind: 'category', values: [{id: 'north', label: local(locale, 'North', 'Norte')}, {id: 'central', label: local(locale, 'Central', 'Centro')}, {id: 'south', label: local(locale, 'South', 'Sur')}]}, y: {kind: 'linear', domain: [0, 100]}},
    series: [{id: 'output', name: local(locale, 'Output', 'Producción'), color: '#2f6fcb', data: [{id: 'north-output', x: 'north', y: 72, z: 180}, {id: 'central-output', x: 'central', y: 89, z: 320}, {id: 'south-output', x: 'south', y: 44, z: 100}]}]};
  const row = base.series[0]!;
  if (id === 'equal') return {...base, series: [{...row, data: row.data.map(point => ({...point, z: 1}))}]};
  if (id === 'missing') return {...base, series: [{...row, data: [{...row.data[0]!, z: null}, {...row.data[1]!, y: null}, {...row.data[2]!, y: 0, z: 0}]}]};
  if (id === 'extremes') return {...base, series: [{...row, data: [{...row.data[0]!, z: Number.MAX_VALUE}, {...row.data[1]!, z: Number.MAX_VALUE}, {...row.data[2]!, z: Number.MIN_VALUE}]}]};
  if (id === 'reversed') return {...base, axes: {...base.axes, x: {...base.axes.x, reversed: true}}};
  if (id === 'negative') return {...base, axes: {...base.axes, y: {kind: 'linear', domain: [-50, 100]}}, series: [{...row, data: row.data.map((point, i) => ({...point, y: i === 1 ? -30 : point.y}))}]};
  return base;
}
