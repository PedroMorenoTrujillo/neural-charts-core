import type { PathCommand } from './path.js';
import { invalid, ok } from '../diagnostics.js';
import type { Result } from '../diagnostics.js';
const TAU = Math.PI * 2;
export type RadialFrame = Readonly<{ cx: number; cy: number; radius: number; innerRadius: number }>;
export function polar(frame: RadialFrame, radius: number, angle: number): Readonly<{ x: number; y: number }> {
  // Logical angle zero is the top seam; the SVG y axis points downwards.
  return { x: frame.cx + radius * Math.sin(angle), y: frame.cy - radius * Math.cos(angle) };
}
export function sectorPath(frame: RadialFrame, start: number, end: number): Result<readonly PathCommand[]> {
  const { cx, cy, radius, innerRadius } = frame;
  if (![cx, cy, radius, innerRadius, start, end, cx - radius, cx + radius, cy - radius, cy + radius].every(Number.isFinite) || radius <= 0 || innerRadius < 0 || innerRadius >= radius || start < -TAU || start > TAU || end < start || end - start > TAU) return invalid('INVALID_CONFIG', 'BAD_RADIAL_GEOMETRY', 'radial.sector');
  if (start === end) return ok(Object.freeze([]));
  const full = end - start === TAU, outerStart = polar(frame, radius, start), outerEnd = full ? outerStart : polar(frame, radius, end);
  if (!full && outerStart.x === outerEnd.x && outerStart.y === outerEnd.y) return ok(Object.freeze([]));
  const commands: PathCommand[] = [{ kind: 'M', ...outerStart }];
  if (full) {
    const opposite = polar(frame, radius, start + Math.PI);
    if (opposite.x === outerStart.x && opposite.y === outerStart.y) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'radial.sector');
    commands.push({ kind: 'A', radius, largeArc: 0, sweep: 1, ...opposite }, { kind: 'A', radius, largeArc: 0, sweep: 1, ...outerStart }, { kind: 'Z' });
    if (innerRadius > 0) {
      const innerStart = polar(frame, innerRadius, start), innerOpposite = polar(frame, innerRadius, start + Math.PI);
      if (innerOpposite.x !== innerStart.x || innerOpposite.y !== innerStart.y) commands.push({ kind: 'M', ...innerStart }, { kind: 'A', radius: innerRadius, largeArc: 0, sweep: 0, ...innerOpposite }, { kind: 'A', radius: innerRadius, largeArc: 0, sweep: 0, ...innerStart }, { kind: 'Z' });
    }
    return ok(Object.freeze(commands.map(command => Object.freeze(command))));
  }
  commands.push({ kind: 'A', radius, largeArc: end - start > Math.PI ? 1 : 0, sweep: 1, ...outerEnd });
  if (innerRadius > 0) {
    const innerEnd = polar(frame, innerRadius, full ? start : end), innerStart = polar(frame, innerRadius, start);
    commands.push({ kind: 'L', ...innerEnd });
    if (innerEnd.x !== innerStart.x || innerEnd.y !== innerStart.y) commands.push({ kind: 'A', radius: innerRadius, largeArc: end - start > Math.PI ? 1 : 0, sweep: 0, ...innerStart });
  } else commands.push({ kind: 'L', x: cx, y: cy });
  commands.push({ kind: 'Z' });
  return ok(Object.freeze(commands.map(command => Object.freeze(command))));
}
