import { number, text } from '../internal/data/validation.js';
import type { PlanLegendItem } from '../public/plan-types.js';

export function planLegend(items: readonly Readonly<{id: string; name: string; color?: string}>[], palette: readonly string[], hidden: readonly string[]): readonly PlanLegendItem[] {
  return items.map((item, i) => ({
    id: item.id, name: item.name, color: item.color ?? palette[i % palette.length]!, visible: !hidden.includes(item.id),
  }));
}

export function readPlanTitle(input: Record<string, unknown>) {
  return {
    title: text(input.title, 'title'),
    description: Object.hasOwn(input, 'description') ? text(input.description, 'description', 4096, true) : '',
  };
}

export function readPlotSize(options: Record<string, unknown>) {
  return {
    width: number(options.width, 'options.width', 64, 10000),
    height: number(options.height, 'options.height', 64, 10000),
  };
}
