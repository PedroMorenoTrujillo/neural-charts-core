import { expect, test } from 'vitest';
import { emptyLayers } from '../../src/internal/axes/scene.js';
import { defaultPalette } from '../../src/internal/chart/presentation.js';
import { selectionScene, crosshairScene } from '../../src/internal/interaction/decoration.js';
import { validateSceneFrame } from '../../src/internal/scene/validate.js';
const plot = Object.freeze({ x: 10, y: 20, width: 100, height: 50 }), point = { x: 60, y: 35 }, palette = defaultPalette('light', false);
test('logical Cartesian X/Y crosshairs use the committed scaled point and actual plot bounds', () => {
  const layers = emptyLayers(); crosshairScene(layers, 'xy', plot, point, palette);
  expect(layers.interaction).toMatchObject([{ kind: 'line', key: 'crosshair-x', x1: 60, x2: 60, y1: 20, y2: 70, clipKey: 'plot' }, { kind: 'line', key: 'crosshair-y', x1: 10, x2: 110, y1: 35, y2: 35, clipKey: 'plot' }]);
  expect(validateSceneFrame({ revision: 1, width: 140, height: 100, defs: [{ key: 'plot', kind: 'clip-rect', ...plot }], layers }).status).toBe('ok');
});
test('horizontal Bar follows semantic category/value axes instead of accidentally swapping datum order', () => {
  const layers = emptyLayers(); crosshairScene(layers, 'x', plot, point, palette, true);
  expect(layers.interaction).toMatchObject([{ x1: 10, x2: 110, y1: 35, y2: 35 }]); const value = emptyLayers(); crosshairScene(value, 'y', plot, point, palette, true); expect(value.interaction).toMatchObject([{ x1: 60, x2: 60, y1: 20, y2: 70 }]);
});
test('disabled decoration produces no marks and invalid coordinates cannot hide behind a PASS', () => {
  const layers = emptyLayers(); crosshairScene(layers, false, plot, point, palette); expect(layers.interaction).toEqual([]); crosshairScene(layers, 'x', plot, { x: NaN, y: 30 }, palette);
  expect(validateSceneFrame({ revision: 1, width: 140, height: 100, defs: [{ key: 'plot', kind: 'clip-rect', ...plot }], layers }).status).toBe('invalid');
});
test('multiple selected marks own bounded unique keys and a non-color cue without mutating geometry', () => {
  const original = Object.freeze({ kind: 'circle' as const, key: 'focus', cx: 40, cy: 40, r: 7, clipKey: 'plot', presentation: Object.freeze({ fill: Object.freeze({ kind: 'solid' as const, value: '#ffffff' }), stroke: Object.freeze({ kind: 'solid' as const, value: '#174da0' }), strokeWidth: 2 }) }), before = JSON.stringify(original), layers = emptyLayers();
  selectionScene(layers, ['a'.repeat(128), 'b'.repeat(128)], (_id, selected) => selected.interaction.push(original));
  expect(layers.interaction.map(command => command.key)).toEqual(['selected-0-focus', 'selected-1-focus']); expect(layers.interaction.every(command => command.presentation?.fill?.kind === 'none' && command.presentation?.dash?.join(',') === '3,2')).toBe(true); expect(JSON.stringify(original)).toBe(before);
  expect(validateSceneFrame({ revision: 1, width: 140, height: 100, defs: [{ key: 'plot', kind: 'clip-rect', ...plot }], layers }).status).toBe('ok');
});
