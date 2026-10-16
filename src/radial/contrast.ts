type Rgba = Readonly<{ r: number; g: number; b: number; a: number }>;
function hex(value: string): Rgba | null {
  if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return null;
  let raw = value.slice(1); if (raw.length <= 4) raw = [...raw].map(channel => channel + channel).join('');
  return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16), a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1 };
}
// W3C WCAG 2.2 relative luminance; no browser color parsing or third-party code.
// https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
function luminance(r: number, g: number, b: number): number {
  const linear = (value: number) => { const encoded = value / 255; return encoded <= .04045 ? encoded / 12.92 : ((encoded + .055) / 1.055) ** 2.4; };
  return .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);
}
export function insideLabelInk(fill: string, surface: string): '#000000' | '#ffffff' | null {
  const color = hex(fill), background = hex(surface); if (!color || color.a < 1 && (!background || background.a < 1)) return null;
  const channel = (key: 'r' | 'g' | 'b') => color[key] * color.a + (background?.[key] ?? 0) * (1 - color.a);
  const light = luminance(channel('r'), channel('g'), channel('b'));
  return (light + .05) / .05 >= 1.05 / (light + .05) ? '#000000' : '#ffffff';
}
