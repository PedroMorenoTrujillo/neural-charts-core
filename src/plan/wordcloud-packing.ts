import type {PlanWordCloudBounds, PlanWordCloudRotation} from '../public/wordcloud-types.js';

export const MAX_WORDCLOUD_ATTEMPTS = 32768;
export const WORDCLOUD_POSITIONS = 256;
export const WORDCLOUD_GRID_SIDE = 16;
export interface MeasuredWordBox {readonly wordId: string; readonly width: number; readonly height: number;}
export interface WordPlacement {
  readonly bounds: PlanWordCloudBounds;
  readonly center: Readonly<{x: number; y: number}>;
  readonly rotation: PlanWordCloudRotation;
}
export interface WordPackingOptions {
  readonly width: number; readonly height: number; readonly padding: number;
  readonly rotations: readonly PlanWordCloudRotation[]; readonly seed: number;
}
export interface WordPackingResult {
  readonly placements: ReadonlyMap<string, WordPlacement>;
  readonly attempts: number; readonly collisionChecks: number; readonly budgetExhausted: boolean;
}
const overlaps = (a: PlanWordCloudBounds, b: PlanWordCloudBounds) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
function wordHash(id: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return hash;
}
class WordGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly boxes: PlanWordCloudBounds[] = [];
  collisionChecks = 0;
  constructor(private readonly width: number, private readonly height: number) {}
  private range(box: PlanWordCloudBounds): readonly [number, number, number, number] {
    const cell = (value: number, extent: number) => Math.max(0, Math.min(WORDCLOUD_GRID_SIDE - 1, Math.floor(value / extent * WORDCLOUD_GRID_SIDE)));
    return [cell(box.x, this.width), cell(box.y, this.height), cell(box.x + box.width, this.width), cell(box.y + box.height, this.height)];
  }
  collides(box: PlanWordCloudBounds): boolean {
    const [left, top, right, bottom] = this.range(box), visited = new Set<number>();
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      for (const index of this.cells.get(y * WORDCLOUD_GRID_SIDE + x) ?? []) {
        if (visited.has(index)) continue; visited.add(index); this.collisionChecks++;
        if (overlaps(box, this.boxes[index]!)) return true;
      }
    }
    return false;
  }
  insert(box: PlanWordCloudBounds): void {
    const index = this.boxes.length; this.boxes.push(box);
    const [left, top, right, bottom] = this.range(box);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const key = y * WORDCLOUD_GRID_SIDE + x, entries = this.cells.get(key);
      if (entries) entries.push(index); else this.cells.set(key, [index]);
    }
  }
}

/** Deterministic rectangle spiral and fixed-size spatial grid; no font assumptions. */
export function packWordCloud(boxes: readonly MeasuredWordBox[], options: WordPackingOptions): WordPackingResult {
  const grid = new WordGrid(options.width, options.height), placements = new Map<string, WordPlacement>();
  let attempts = 0, budgetExhausted = false;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (const word of boxes) {
    if (word.width === 0 || word.height === 0) continue;
    const hash = wordHash(word.wordId, options.seed), preferred = hash % options.rotations.length;
    const rotations = options.rotations.map((_, i) => options.rotations[(preferred + i) % options.rotations.length]!).filter((rotation, i, list) => {
      if (word.width === word.height && i > 0) return false;
      const width = rotation === 0 ? word.width : word.height, height = rotation === 0 ? word.height : word.width;
      return width + options.padding * 2 <= options.width && height + options.padding * 2 <= options.height && list.indexOf(rotation) === i;
    });
    let placed = false;
    for (let position = 0; position < WORDCLOUD_POSITIONS && !placed && rotations.length; position++) {
      const angle = position * goldenAngle + hash / 0x100000000 * Math.PI * 2;
      const radius = position === 0 ? 0 : Math.sqrt(position / (WORDCLOUD_POSITIONS - 1));
      const cosine = Math.cos(angle), sine = Math.sin(angle), divisor = Math.max(Math.abs(cosine), Math.abs(sine));
      const nx = cosine / divisor * radius, ny = sine / divisor * radius;
      for (const rotation of rotations) {
        if (attempts >= MAX_WORDCLOUD_ATTEMPTS) {budgetExhausted = true; break;}
        attempts++;
        const width = rotation === 0 ? word.width : word.height, height = rotation === 0 ? word.height : word.width;
        const paddedWidth = width + options.padding * 2, paddedHeight = height + options.padding * 2;
        const box = {x: (options.width - paddedWidth) * (nx + 1) / 2, y: (options.height - paddedHeight) * (ny + 1) / 2, width: paddedWidth, height: paddedHeight};
        const bounds = {x: box.x + options.padding, y: box.y + options.padding, width, height};
        if (bounds.x + width <= bounds.x || bounds.y + height <= bounds.y || box.x < 0 || box.y < 0 || box.x + box.width > options.width || box.y + box.height > options.height) continue;
        if (grid.collides(box)) continue;
        grid.insert(box); placements.set(word.wordId, {bounds, center: {x: bounds.x + width / 2, y: bounds.y + height / 2}, rotation}); placed = true; break;
      }
      if (budgetExhausted) break;
    }
    if (budgetExhausted) break;
  }
  return {placements, attempts, collisionChecks: grid.collisionChecks, budgetExhausted};
}
