import { describe, expect, it } from 'vitest';
import { findTile, squarify } from '../../src/treemap/squarify.js';
import { treeIdentities, validateTreemap, validateTreemapOptions } from '../../src/treemap/validate.js';
import { treeColors } from '../../src/treemap/color.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';

const source = {
  family: 'treemap', title: 'Balance', root: { id: 'root', children: [
    { id: 'zone', children: [{ id: 'zero', value: 0 }, { id: 'missing', value: null }] },
    { id: 'live', value: 14, colorValue: 3 },
  ] },
};
const colorScales = [
  { type: 'threshold', boundaries: [0], colors: ['#111', '#eee'] },
  { type: 'diverging', domain: [-4, 0, 9], colors: ['#111', '#ddd', '#eee'] },
  { type: 'sequential', domain: [0, 10], colors: ['#111', '#eee'] },
  { type: 'sequential', colors: ['#111', '#eee'], positions: [0, 1] },
];

describe('treemap immutable hierarchy and validated options', () => {
  it('separates quantitative leaf colors, unknown leaf colors and neutral group labels', () => {
    const palette = defaultPalette('light', false);
    const root = {id: 'root', children: [{id: 'group', children: [
      {id: 'low', value: 1, colorValue: 0}, {id: 'high', value: 1, colorValue: 10}, {id: 'missing', value: 1, colorValue: null},
    ]}]};
    const resolve = (color?: unknown) => {
      const data = validateTreemap({...source, root, ...(color === undefined ? {} : {color})});
      if (data.status === 'invalid') throw Error(JSON.stringify(data.diagnostic));
      const result = treeColors(data.value, palette);
      if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
      const rows = Object.fromEntries(data.value.hierarchy.nodes.map(node => [node.node.id,
        {color: result.value.color(node), missing: result.value.missing(node)}]));
      return {scale: result.value.quantitative, rows};
    };
    const groups = resolve();
    expect(groups.scale).toBeNull();
    expect(groups.rows.low?.color).toBe(groups.rows.high?.color);
    expect(groups.rows.missing?.missing).toBe(false);
    const quantitative = resolve({by: 'value'});
    expect(quantitative.scale).not.toBeNull();
    expect(quantitative.rows.low?.color).not.toBe(quantitative.rows.high?.color);
    expect(quantitative.rows.group).toEqual({color: palette.surface, missing: false});
    expect(quantitative.rows.missing).toEqual({color: palette.surface, missing: true});
    const explicit = resolve({by: 'value', scale: {type: 'sequential', domain: [0, 10], colors: ['#123456', '#abcdef']}});
    expect(explicit.rows.low?.color).toBe('#123456');
    expect(explicit.rows.high?.color).toBe('#abcdef');
  });

  it.each(colorScales)('preserves explicit color metadata and valid selection for %j', scale => {
    const input = { ...source, color: { by: 'value', scale }, selection: { mode: 'internal', initial: [{ pointId: 'zero' }] } };
    const result = validateTreemap(input);
    if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
    expect([...treeIdentities(result.value.hierarchy).values()].map(item => item.pointId)).toEqual(['root', 'zone', 'zero', 'live']);
    expect(result.value.spec.color).toMatchObject({ by: 'value', scale: { type: scale.type } });
    expect(result.value.colorScale?.type).toBe(scale.type);
    expect(Object.isFrozen(result.value.spec.color)).toBe(true);
    expect(result.value.spec.root).not.toBe(input.root);
  });

  it('allows group ownership, explicit disabled selection and renderer callbacks', () => {
    const result = validateTreemap({ ...source, color: { by: 'group' }, selection: false });
    expect(result).toMatchObject({ status: 'ok', value: { colorScale: null, spec: { selection: false } } });
    const onSelectionChange = () => {};
    const options = validateTreemapOptions({ instanceId: 'data-map', onSelectionChange });
    expect(options).toMatchObject({ status: 'ok', value: { instanceId: 'data-map', onSelectionChange } });
    expect(validateTreemapOptions({ instanceId: '1bad' })).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'BAD_INSTANCE_ID' },
    });
    expect(validateTreemapOptions({ instanceId: 'data-map', onDiagnostic: 'yes' })).toMatchObject({
      status: 'invalid', diagnostic: { path: 'options.onDiagnostic' },
    });
  });

  it.each([
    [{ color: { by: 'group', scale: colorScales[0] } }, 'GROUP_COLOR_HAS_NO_SCALE'],
    [{ selection: { mode: 'controlled', value: [{ seriesId: 'other', pointId: 'live' }] } }, 'BAD_SELECTION_ID'],
    [{ selection: { mode: 'controlled', value: [{ pointId: 'missing' }] } }, 'UNKNOWN_SELECTION'],
    [{ selection: { mode: 'internal', initial: [{ pointId: 'not-a-node' }] } }, 'UNKNOWN_SELECTION'],
  ] as const)('rejects invalid hierarchy presentation without changing the source', (options, reason) => {
    expect(validateTreemap({ ...source, ...options })).toMatchObject({ status: 'invalid', diagnostic: { reason } });
    expect(source.root.children[1]?.value).toBe(14);
  });

  it('rejects a hierarchy whose root owns both a scalar and children', () => {
    expect(validateTreemap({ ...source, root: { ...source.root, value: 5 } }).status).toBe('invalid');
  });
});

describe('treemap strip containment, zero area and finite extent', () => {
  const nodes = [{ id: 'b', index: 0, weight: 4 }, { id: 'a', index: 1, weight: 4 }, { id: 'zero', index: 2, weight: 0 }, { id: 'c', index: 3, weight: 12 }];
  const rect = { x: -5, y: 15, width: 200, height: 100 };
  it.each([[200, 100], [100, 200], [115, 115], [8192, 64]] as const)(
    'conserves exact weight area and gives each shared edge a single owner for %s×%s',
    (width, height) => {
      const bounds = { ...rect, width, height };
      const result = squarify(nodes, bounds);
      if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
      const { tiles, unrepresented } = result.value;
      expect(tiles.map(tile => tile.id)).toEqual(['c', 'a', 'b']);
      expect(unrepresented).toEqual([{ index: 2, reason: 'zero' }]);
      expect(tiles.reduce((area, tile) => area + tile.rect.width * tile.rect.height, 0)).toBeCloseTo(width * height);
      for (const tile of tiles) {
        const { x, y, width: w, height: h } = tile.rect;
        expect(w * h).toBeCloseTo(width * height * tile.weight / 20);
        expect(findTile(result.value, x + w / 2, y + h / 2)?.id).toBe(tile.id);
      }
      expect(findTile(result.value, rect.x - 1, rect.y + 1)).toBeNull();
      expect(findTile(result.value, rect.x + width, rect.y + height)?.id).toBeDefined();
    },
  );

  it('reports zero space and sub-pixel representability explicitly without dropping weights silently', () => {
    for (const [bounds, reason] of [
      [{ ...rect, height: 0 }, 'underflow'],
      [{ ...rect, x: 1e22 }, 'coordinate-resolution'],
      [{ ...rect, y: 1e22 }, 'coordinate-resolution'],
    ] as const) {
      const result = squarify(nodes, bounds);
      if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
      expect(result.value.tiles).toHaveLength(0);
      expect(result.value.unrepresented.filter(item => item.index !== 2).every(item => item.reason === reason)).toBe(true);
      expect(result.value.unrepresented).toHaveLength(4);
      expect(findTile(result.value, bounds.x, bounds.y)).toBeNull();
    }
  });

  it('validates weights, duplicate indices and total arithmetic range', () => {
    for (const bad of [
      { id: '', index: 4, weight: 3 }, { id: 'd', index: -1, weight: 3 },
      { id: 'd', index: 4.5, weight: 3 }, { id: 'd', index: 4, weight: -1 },
      { id: 'd', index: 4, weight: Infinity }, { id: 'd', index: 0, weight: 1 },
      { id: 'b', index: 4, weight: 1 },
    ]) expect(squarify([...nodes, bad], rect)).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'BAD_TREEMAP_WEIGHT' },
    });
    expect(squarify(nodes, { ...rect, height: -1 })).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'BAD_TREEMAP_BOUNDS' },
    });
    expect(squarify(nodes, { ...rect, width: Number.MAX_VALUE, height: 8 })).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'TREEMAP_RANGE_OVERFLOW' },
    });
    expect(squarify(nodes.map(n => ({ ...n, weight: Number.MAX_VALUE })), rect)).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'TREEMAP_RANGE_OVERFLOW' },
    });
  });
});
