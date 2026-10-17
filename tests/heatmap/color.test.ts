import { expect, it } from 'vitest';
import { rgbToOklab, oklabToRgb, mixOklab, rgbHex, type ColorVector } from '../../src/internal/color/oklab.js';
it('preserves all integer RGB endpoints and roundtrips a fixed gamut grid', () => {
  const channels = [0, 1, 32, 64, 127, 128, 192, 254, 255];
  for (const r of channels) for (const g of channels) for (const b of channels) {
    const rgb = Object.freeze([r, g, b] as const), other = Object.freeze([255 - r, 255 - g, 255 - b] as const);
    expect(oklabToRgb(rgbToOklab(rgb))).toEqual(rgb); expect(mixOklab(rgb, other, 0)).toBe(rgb); expect(mixOklab(rgb, other, 1)).toBe(other);
  }
});
it('uses the perceptual lightness midpoint and coherent D65 neutral white', () => {
  expect(rgbToOklab([255, 255, 255])[0]).toBeCloseTo(1, 7); expect(rgbToOklab([255, 255, 255])[1]).toBeCloseTo(0, 7); expect(rgbToOklab([255, 255, 255])[2]).toBeCloseTo(0, 7);
  expect(mixOklab([0, 0, 0], [255, 255, 255], .5)).toEqual([99, 99, 99]);
  const red = rgbToOklab([255, 0, 0]); expect(red[0]).toBeCloseTo(.627955, 5); expect(red[1]).toBeCloseTo(.224863, 5); expect(red[2]).toBeCloseTo(.125846, 5);
});
it('keeps fixed saturated ramps finite, quantized, symmetric and in sRGB', () => {
  const colors: ColorVector[] = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 0]];
  for (const first of colors) for (const last of colors) for (let step = 0; step <= 16; step++) {
    const mixed = mixOklab(first, last, step / 16); expect(mixed.every(value => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);
    expect(mixed).toEqual(mixOklab(last, first, 1 - step / 16)); expect(rgbHex(mixed)).toMatch(/^#[0-9a-f]{6}$/);
  }
  expect(() => mixOklab(colors[0]!, colors[1]!, NaN)).toThrow(RangeError);
});
it('reduces chroma without a NaN for extremely out-of-gamut finite coordinates', () => {
  for (const lab of [[.5, 2, -2], [.8, -.9, 3], [1, 1, 1], [0, -1, -1]] as const) {
    const rgb = oklabToRgb(lab); expect(rgb.every(value => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);
    expect(rgbToOklab(rgb)[0]).toBeCloseTo(lab[0], 2);
  }
});
