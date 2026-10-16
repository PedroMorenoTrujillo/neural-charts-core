import { describe, expect, it } from 'vitest';
import { intersect, placeTooltip } from '../../src/internal/tooltip/place.js';

describe('Stacked detail placement', () => {
  it('shifts sideways above a selected segment instead of clamping onto it', () => {
    const anchor = { x: 47, y: 205, width: 29, height: 60 }, size = { width: 273, height: 86 };
    const placed = placeTooltip(anchor, size, { x: 0, y: 36, width: 320, height: 400 }, 'top', 'ltr', true);
    expect(placed.kind).toBe('floating');
    if (placed.kind === 'floating') {
      const overlap = intersect({ ...placed, ...size }, anchor);
      expect(overlap.width * overlap.height).toBe(0);
      expect(placed.y + size.height).toBeLessThanOrEqual(anchor.y);
    }
  });
  it('docks when every clamped position would cover the selected rectangle', () => {
    const anchor = { x: 0, y: 0, width: 320, height: 400 };
    for (const direction of ['ltr', 'rtl'] as const) {
      expect(placeTooltip(anchor, { width: 280, height: 100 }, anchor, 'top', direction, true)).toEqual({ kind: 'docked' });
    }
  });
  it('retains the original placement policy when avoidance is not requested', () => {
    const anchor = { x: 47, y: 205, width: 29, height: 60 }, size = { width: 273, height: 86 }, allowed = { x: 0, y: 36, width: 320, height: 400 };
    expect(placeTooltip(anchor, size, allowed, 'top', 'ltr')).toEqual(placeTooltip(anchor, size, allowed, 'top', 'ltr', false));
  });
});
