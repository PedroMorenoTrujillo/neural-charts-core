/** Neural implementation of the mathematical sRGB/D65/OKLab transforms.
 * Coefficients: CSS Color4 CRD2026-10-09, sections9.2/10.2/19;
 * https://www.w3.org/TR/2026/CRD-css-color-4-20261009/
 * Original space definition: https://bottosson.github.io/posts/oklab/
 * No library or standard sample implementation is copied. The bounded chroma
 * reduction below is Neural's policy, not the CSS gamut-mapping algorithm. */
export type ColorVector = readonly [number, number, number];
type Matrix = readonly [number, number, number, number, number, number, number, number, number];
const RGB_XYZ: Matrix = [506752 / 1228815, 87881 / 245763, 12673 / 70218, 87098 / 409605, 175762 / 245763, 12673 / 175545, 7918 / 409605, 87881 / 737289, 1001167 / 1053270];
const XYZ_LMS: Matrix = [.8190224379967030, .3619062600528904, -.1288737815209879, .0329836539323885, .9292868615863434, .0361446663506424, .0481771893596242, .2642395317527308, .6335478284694309];
const LMS_LAB: Matrix = [.2104542683093140, .7936177747023054, -.0040720430116193, 1.9779985324311684, -2.4285922420485799, .4505937096174110, .0259040424655478, .7827717124575296, -.8086757549230774];
function apply(m: Matrix, v: ColorVector): ColorVector { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
function inverse(m: Matrix): Matrix {
  const [a, b, c, d, e, f, g, h, i] = m;
  const cofactors: Matrix = [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
  const determinant = a * cofactors[0] + b * cofactors[3] + c * cofactors[6];
  return [cofactors[0] / determinant, cofactors[1] / determinant, cofactors[2] / determinant, cofactors[3] / determinant, cofactors[4] / determinant, cofactors[5] / determinant, cofactors[6] / determinant, cofactors[7] / determinant, cofactors[8] / determinant];
}
const LAB_LMS = inverse(LMS_LAB), LMS_XYZ = inverse(XYZ_LMS), XYZ_RGB = inverse(RGB_XYZ);
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const decode = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const encode = (value: number) => value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055;
export function rgbToOklab(rgb: ColorVector): ColorVector {
  const xyz = apply(RGB_XYZ, [decode(rgb[0] / 255), decode(rgb[1] / 255), decode(rgb[2] / 255)]), lms = apply(XYZ_LMS, xyz);
  return apply(LMS_LAB, [Math.cbrt(lms[0]), Math.cbrt(lms[1]), Math.cbrt(lms[2])]);
}
export function oklabToLinearRgb(lab: ColorVector): ColorVector {
  const lms = apply(LAB_LMS, lab);
  return apply(XYZ_RGB, apply(LMS_XYZ, [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3]));
}
function inGamut(rgb: ColorVector): boolean { return rgb.every(value => value >= -1e-7 && value <= 1 + 1e-7); }
export function oklabToRgb(lab: ColorVector): ColorVector {
  const lightness = clamp(lab[0]); let rgb = oklabToLinearRgb([lightness, lab[1], lab[2]]);
  if (!inGamut(rgb)) {
    let low = 0, high = 1; rgb = oklabToLinearRgb([lightness, 0, 0]);
    for (let iteration = 0; iteration < 16; iteration++) {
      const factor = low / 2 + high / 2, candidate = oklabToLinearRgb([lightness, lab[1] * factor, lab[2] * factor]);
      if (inGamut(candidate)) { low = factor; rgb = candidate; } else high = factor;
    }
  }
  return [Math.round(255 * encode(clamp(rgb[0]))), Math.round(255 * encode(clamp(rgb[1]))), Math.round(255 * encode(clamp(rgb[2])))];
}
export function mixOklab(first: ColorVector, last: ColorVector, fraction: number): ColorVector {
  if (!Number.isFinite(fraction)) throw RangeError('Finite color fraction required');
  if (fraction <= 0) return first; if (fraction >= 1) return last;
  const a = rgbToOklab(first), b = rgbToOklab(last), t = fraction;
  return oklabToRgb([a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t]);
}
export function rgbHex(rgb: ColorVector): string { return '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join(''); }
