// Replace the staged type import with the published Core /plan entry on promotion.
import type {PlanWordCloudSpec} from '../../../src/plan.js';

export type WordCloudExampleId = 'basic' | 'groups' | 'vertical' | 'precision' | 'missing' | 'zero' | 'longLabels' | 'budget';
type Locale = 'en' | 'es';
const local = <T>(locale: Locale, en: T, es: T): T => locale === 'es' ? es : en;
const vocabulary = [
  ['quality', 'Quality', 'Calidad'], ['performance', 'Performance', 'Rendimiento'], ['documentation', 'Documentation', 'Documentación'],
  ['touch', 'Touch controls', 'Control táctil'], ['accessibility', 'Accessibility', 'Accesibilidad'], ['privacy', 'Privacy', 'Privacidad'],
  ['signals', 'Signals', 'Signals'], ['mobile', 'Mobile', 'Móvil'], ['tablet', 'Tablet', 'Tablet'],
  ['native', 'Native', 'Nativo'], ['themes', 'Themes', 'Temas'], ['stability', 'Stability', 'Estabilidad'],
] as const;
export const wordcloudCopy = {
  en: {
    name: 'Word cloud', description: 'Weighted text placed from actual renderer measurements.',
    when: 'Use a word cloud to compare the relative prominence of terms. Use a list or bar chart when exact ranking and numerical comparison are more important.',
    data: 'Each word has an original id, text and non-negative weight. null is unknown and zero is known. The source alternative retains every word, including those outside the scene budget or unable to fit.',
    layout: 'Font sizes are requested in logical units. No automatic downscaling is applied to make a long term fit. Only 0° and 90° rotations are supported.',
    compatibility: 'Up to 2048 source words and 128 measurement candidates. The scene has a fixed placement budget. No axes, stacking, references, zoom or shared tooltip in this version.',
  },
  es: {
    name: 'Nube de palabras', description: 'Texto ponderado colocado a partir de medidas reales del renderer.',
    when: 'Úsala para comparar la importancia relativa de términos. Elige una lista o barras si importa más el orden exacto y la comparación numérica.',
    data: 'Cada palabra tiene id original, texto y peso no negativo. null es desconocido y cero es conocido. La alternativa de datos conserva todas las palabras, incluidas las que exceden el límite seleccionado o no caben.',
    layout: 'Los tamaños de fuente se solicitan en unidades lógicas. No se reduce automáticamente la escala para encajar un término largo. Solo se admiten rotaciones de 0° y 90°.',
    compatibility: 'Hasta 2048 palabras originales y 128 candidatas a medición. La escena tiene un presupuesto fijo de colocación. Esta versión no admite ejes, apilado, referencias, zoom ni tooltip compartido.',
  },
} as const;
export interface WordCloudExample {readonly id: WordCloudExampleId; readonly name: string; readonly description: string;}
export function wordcloudExamples(locale: Locale): readonly WordCloudExample[] {
  return [
    {id: 'basic', name: local(locale, 'Feedback topics', 'Temas de los comentarios'), description: local(locale, 'Original term weights and a horizontal cloud.', 'Pesos originales de los términos y una nube horizontal.')},
    {id: 'groups', name: local(locale, 'Source groups', 'Grupos de origen'), description: local(locale, 'Meaningful source groups can be hidden and restored; there is no legend row for every word.', 'Los grupos originales se pueden ocultar y restaurar; no hay una fila de leyenda por palabra.')},
    {id: 'vertical', name: local(locale, 'Optional vertical text', 'Texto vertical opcional'), description: local(locale, 'Allow 0°/90° text while retaining the measured unrotated bounds and exact font sizes.', 'Permite texto a 0°/90° y conserva las medidas originales y los tamaños exactos de fuente.')},
    {id: 'precision', name: local(locale, 'Very different weights', 'Pesos muy diferentes'), description: local(locale, 'Finite extreme weights do not overflow a total or become fabricated zero.', 'Los pesos finitos extremos no desbordan un total ni se convierten en cero inventado.')},
    {id: 'missing', name: local(locale, 'Unknown and zero', 'Desconocido y cero'), description: local(locale, 'Neither unknown nor zero weights create text; their meanings remain distinct in the source alternative.', 'Los pesos desconocidos y cero no crean texto; mantienen significados distintos en los datos originales.')},
    {id: 'zero', name: local(locale, 'All weights zero', 'Todos los pesos a cero'), description: local(locale, 'The source still exists even though there are no positive words to place.', 'Los datos de origen siguen existiendo aunque no haya palabras positivas para colocar.')},
    {id: 'longLabels', name: local(locale, 'Long terms', 'Términos largos'), description: local(locale, 'A term that does not fit remains in the source data. It is not truncated or secretly reduced below the configured font size.', 'Un término que no cabe sigue en los datos originales. No se trunca ni se reduce a escondidas por debajo del tamaño configurado.')},
    {id: 'budget', name: local(locale, 'Bounded scene', 'Escena acotada'), description: local(locale, 'Select the top 32 candidates from a controlled source of 320 labels; all remaining values are available in the source alternative.', 'Selecciona las 32 candidatas principales de un origen controlado de 320 etiquetas; el resto de los valores sigue disponible en los datos originales.')},
  ];
}
export function wordcloudExampleSpec(example: WordCloudExampleId, locale: Locale): PlanWordCloudSpec {
  const base = {family: 'wordcloud' as const, title: local(locale, 'Topics in product feedback', 'Temas en comentarios del producto'),
    description: wordcloudExamples(locale).find(item => item.id === example)!.description,
    words: vocabulary.map(([id, en, es], i) => ({id, text: local(locale, en, es), weight: [64, 54, 48, 40, 36, 30, 26, 22, 18, 14, 10, 6][i]!})),
    minFontSize: 12, maxFontSize: 42, padding: 2, maxWords: 64};
  if (example === 'groups') return {...base, groups: [{id: 'experience', label: local(locale, 'Experience', 'Experiencia')}, {id: 'engineering', label: local(locale, 'Engineering', 'Ingeniería')}], words: base.words.map((word, i) => ({...word, groupId: i % 2 ? 'engineering' : 'experience'}))};
  if (example === 'vertical') return {...base, rotations: [0, 90], seed: 42};
  if (example === 'precision') return {...base, words: [{id: 'largest', text: local(locale, 'Largest', 'Mayor'), weight: Number.MAX_VALUE}, {id: 'large', text: local(locale, 'Large', 'Grande'), weight: 1e308}, {id: 'tiny', text: local(locale, 'Tiny', 'Diminuto'), weight: Number.MIN_VALUE}]};
  if (example === 'missing') return {...base, words: base.words.map((word, i) => ({...word, weight: i % 3 === 0 ? null : i % 3 === 1 ? 0 : word.weight}))};
  if (example === 'zero') return {...base, words: base.words.map(word => ({...word, weight: 0}))};
  if (example === 'longLabels') return {...base, maxFontSize: 36, words: [
    {id: 'long', text: local(locale, 'Reliable interactions across phones and tablets with accessible source data', 'Interacciones fiables en teléfonos y tablets con datos originales accesibles'), weight: 50},
    {id: 'stable', text: local(locale, 'Stable identities', 'Identidades estables'), weight: 40},
    {id: 'clear', text: local(locale, 'Clear documentation', 'Documentación clara'), weight: 30},
    {id: 'source', text: local(locale, 'Source data', 'Datos originales'), weight: 20},
    {id: 'touch', text: local(locale, 'Touch', 'Tacto'), weight: 10},
  ]};
  if (example === 'budget') return {...base, maxWords: 32, words: Array.from({length: 320}, (_, i) => ({id: 'topic-' + i, text: local(locale, 'Topic ' + (i + 1), 'Tema ' + (i + 1)), weight: 320 - i}))};
  return base;
}
