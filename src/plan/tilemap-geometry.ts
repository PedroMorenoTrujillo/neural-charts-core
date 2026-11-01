/** Renderer-independent offset-column tiles. All dimensions are logical units. */
import type {PlanTileShape} from '../public/tilemap-types.js';
export type TileShape = PlanTileShape;
export interface TileSource {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}
export interface TilePoint {readonly x: number; readonly y: number;}
export interface TileBounds extends TilePoint {readonly width: number; readonly height: number;}
export interface TileGeometry {
  readonly id: string;
  readonly center: TilePoint;
  readonly bounds: TileBounds;
  readonly points: readonly TilePoint[];
  readonly radius?: number;
  readonly omitted: boolean;
}
export interface TileLayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly shape: TileShape;
  /** Inset from each tile edge, so adjacent tiles have twice this gap. */
  readonly padding: number;
}
export interface TileLayout {
  readonly tiles: readonly TileGeometry[];
  readonly scale: number;
  readonly bounds: TileBounds | null;
}

const SQRT3 = Math.sqrt(3);
const MAX_POINTS = 2048;
const MAX_SPAN = 4096;
const shapes: readonly TileShape[] = ['hexagon', 'circle', 'diamond', 'square'];
function finite(value: number): boolean {return Number.isFinite(value);}
function point(x: number, y: number): TilePoint {return Object.freeze({x, y});}
function parity(value: number): number {return ((value % 2) + 2) % 2;}

/** Pure bounded geometry. Public JSON ownership/diagnostics live at the planner port. */
export function layoutTiles(source: readonly TileSource[], options: TileLayoutOptions): TileLayout {
  if (!finite(options.width) || !finite(options.height) || options.width <= 0 || options.height <= 0 ||
    options.width > 16384 || options.height > 16384 || !shapes.includes(options.shape) ||
    !finite(options.padding) || options.padding < 0 || options.padding > 32 || source.length > MAX_POINTS) {
    throw new RangeError('Invalid tile layout options');
  }
  const ids = new Set<string>(), cells = new Set<string>();
  let firstX = Infinity, lastX = -Infinity, firstY = Infinity, lastY = -Infinity;
  for (const tile of source) {
    if (typeof tile.id !== 'string' || tile.id.length === 0 || tile.id.length > 256 ||
      !Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y) ||
      Math.abs(tile.x) > 1e6 || Math.abs(tile.y) > 1e6 || ids.has(tile.id)) {
      throw new RangeError('Invalid tile identity or coordinate');
    }
    const cell = `${tile.x},${tile.y}`;
    if (cells.has(cell)) throw new RangeError('Duplicate tile coordinate');
    ids.add(tile.id); cells.add(cell);
    firstX = Math.min(firstX, tile.x); lastX = Math.max(lastX, tile.x);
    firstY = Math.min(firstY, tile.y); lastY = Math.max(lastY, tile.y);
  }
  if (!source.length) return Object.freeze({tiles: Object.freeze([]), scale: 0, bounds: null});
  if (lastX - firstX > MAX_SPAN || lastY - firstY > MAX_SPAN) throw new RangeError('Tile span exceeds budget');
  // Flat-top hexagons, close-packed circles and diamonds use offset columns.
  // Square coordinates retain an ordinary Cartesian grid. Y grows downwards.
  const unitX = options.shape === 'hexagon' ? 1.5 : options.shape === 'circle' ? SQRT3 : options.shape === 'diamond' ? 1 : 2;
  const unitY = options.shape === 'hexagon' ? SQRT3 : 2;
  const halfHeight = options.shape === 'hexagon' ? SQRT3 / 2 : 1;
  const local = source.map(tile => ({
    id: tile.id,
    x: (tile.x - firstX) * unitX,
    y: (tile.y - firstY) * unitY + (options.shape === 'square' ? 0 : parity(tile.x) * unitY / 2),
  }));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const tile of local) {
    minX = Math.min(minX, tile.x - 1); maxX = Math.max(maxX, tile.x + 1);
    minY = Math.min(minY, tile.y - halfHeight); maxY = Math.max(maxY, tile.y + halfHeight);
  }
  const scale = Math.min(options.width / (maxX - minX), options.height / (maxY - minY));
  const width = (maxX - minX) * scale, height = (maxY - minY) * scale;
  const offsetX = (options.width - width) / 2 - minX * scale;
  const offsetY = (options.height - height) / 2 - minY * scale;
  const inradius = scale * (options.shape === 'hexagon' ? SQRT3 / 2 : options.shape === 'diamond' ? Math.SQRT1_2 : 1);
  const radius = Math.max(0, scale * (1 - options.padding / inradius));
  // An unreadable tile retains its source identity without a fabricated hit region.
  const omitted = radius < 0.5;
  const tiles = local.map(tile => {
    const center = point(tile.x * scale + offsetX, tile.y * scale + offsetY);
    let points: readonly TilePoint[] = [];
    if (!omitted && options.shape === 'hexagon') {
      points = Array.from({length: 6}, (_, index) => {
        const angle = index * Math.PI / 3;
        return point(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle));
      });
    } else if (!omitted && options.shape === 'diamond') {
      points = [point(center.x, center.y - radius), point(center.x + radius, center.y),
        point(center.x, center.y + radius), point(center.x - radius, center.y)];
    } else if (!omitted && options.shape === 'square') {
      points = [point(center.x - radius, center.y - radius), point(center.x + radius, center.y - radius),
        point(center.x + radius, center.y + radius), point(center.x - radius, center.y + radius)];
    }
    const visibleHalfHeight = options.shape === 'hexagon' ? radius * SQRT3 / 2 : radius;
    return Object.freeze({id: tile.id, center,
      bounds: Object.freeze({x: center.x - radius, y: center.y - visibleHalfHeight,
        width: radius * 2, height: visibleHalfHeight * 2}),
      points: Object.freeze(points), ...(options.shape === 'circle' && !omitted ? {radius} : {}), omitted});
  });
  return Object.freeze({tiles: Object.freeze(tiles), scale,
    bounds: Object.freeze({x: (options.width - width) / 2, y: (options.height - height) / 2, width, height})});
}

/** Inclusive edge hit; omitted cells never steal touches from their neighbours. */
export function hitTile(tile: TileGeometry, x: number, y: number): boolean {
  if (tile.omitted || !finite(x) || !finite(y)) return false;
  if (x < tile.bounds.x || x > tile.bounds.x + tile.bounds.width || y < tile.bounds.y || y > tile.bounds.y + tile.bounds.height) return false;
  if (tile.radius !== undefined) return Math.hypot(x - tile.center.x, y - tile.center.y) <= tile.radius;
  let sign = 0;
  for (let index = 0; index < tile.points.length; index++) {
    const a = tile.points[index]!, b = tile.points[(index + 1) % tile.points.length]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const next = Math.sign(cross);
    if (sign && sign !== next) return false;
    sign = next;
  }
  return tile.points.length >= 3;
}
