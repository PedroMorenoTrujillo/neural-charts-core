import { it, expect } from 'vitest';
import { dockRegion } from '../../src/internal/tooltip/dock.js';

it('dock regions exclude the selected halo, contain detail and prefer a complete plot fit', () => {
  for (const width of [296, 366, 744, 1256]) for (const height of [134, 194, 288, 488]) for (const direction of ['ltr', 'rtl'] as const) {
    const plot = { x: 32, y: 20, width: width - 40, height: height - 72 }, body = { x: 0, y: 0, width, height };
    for (const xf of [0, .25, .5, .75, 1]) for (const yf of [0, .5, 1]) {
      const anchor = { x: plot.x + plot.width * xf - 6, y: plot.y + plot.height * yf - 6, width: 12, height: 12 };
      for (const contentHeight of [82, 250, 1500]) {
        const rect = dockRegion({ anchor, plot, body }, { width: 280, height: contentHeight }, direction);
        expect(rect.width).toBeGreaterThan(0); expect(rect.height).toBeGreaterThan(0);
        expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(width); expect(rect.y + rect.height).toBeLessThanOrEqual(height);
        expect(rect.x >= anchor.x + anchor.width + 8 || rect.x + rect.width <= anchor.x - 8 || rect.y >= anchor.y + anchor.height + 8 || rect.y + rect.height <= anchor.y - 8).toBe(true);
      }
    }
  }
});
