import { describe, expect, it } from 'vitest';
import { createPathBuilder, MAX_PATH_COMMANDS, serializePath } from '../../src/internal/geometry/path.js';
import type { PathBuilder, PathCommand } from '../../src/internal/geometry/path.js';

const move = { type: 'M', x: 1, y: 2 } as const;
const line = { type: 'L', x: 3, y: 4 } as const;
const arc = { type: 'A', radius: 5, largeArc: 0, sweep: 1, x: 6, y: 7 } as const;
const close = { type: 'Z' } as const;

describe('retained chart path grammar', () => {
  it('serializes compound paths with canonical zero and the SVG arc flags', () => {
    const commands = [{ ...move, x: -0 }, line, arc, close, move, { ...arc, largeArc: 1, sweep: 0 }] as const;
    expect(serializePath(commands)).toEqual({ status: 'ok', value: 'M 0 2 L 3 4 A 5 5 0 0 1 6 7 Z M 1 2 A 5 5 0 1 0 6 7' });
    expect(serializePath([])).toEqual({ status: 'ok', value: '' });
  });

  it.each([
    [null, 'RESOURCE_LIMIT', 'path'],
    [Array(MAX_PATH_COMMANDS + 1), 'RESOURCE_LIMIT', 'path'],
    [[null], 'BAD_PATH', 'path[0]'],
    [[{}], 'BAD_PATH', 'path[0]'],
    [[{ ...move, fill: '#aaa' }], 'BAD_PATH', 'path[0]'],
    [[close], 'BAD_PATH_GRAMMAR', 'path[0]'],
    [[move, close, line], 'BAD_PATH_GRAMMAR', 'path[2]'],
    [[arc], 'BAD_PATH_GRAMMAR', 'path[0]'],
    [[move, { ...line, x: Infinity }], 'NONFINITE', 'path[1]'],
    [[move, { ...line, y: NaN }], 'NONFINITE', 'path[1]'],
    [[move, { ...arc, radius: NaN }], 'BAD_ARC', 'path[1]'],
    [[move, { ...arc, radius: 0 }], 'BAD_ARC', 'path[1]'],
    [[move, { ...arc, largeArc: 2 }], 'BAD_ARC', 'path[1]'],
    [[move, { ...arc, sweep: 2 }], 'BAD_ARC', 'path[1]'],
    [[move, { ...arc, x: move.x, y: move.y }], 'BAD_ARC', 'path[1]'],
  ])('rejects an invalid command (case %#)', (commands, reason, path) => {
    expect(serializePath(commands as readonly PathCommand[])).toMatchObject({ status: 'invalid', diagnostic: { reason, path } });
  });
});

describe('one-shot chart path builder', () => {
  it('retains immutable commands in builder order and rejects reuse', () => {
    const builder = createPathBuilder();
    builder.moveTo(move.x, move.y);
    builder.lineTo(line.x, line.y);
    builder.arcTo(arc.radius, arc.largeArc, arc.sweep, arc.x, arc.y);
    builder.close();
    const result = builder.finish();
    expect(result).toEqual({ status: 'ok', value: [move, line, arc, close] });
    if (result.status !== 'ok') throw new Error('Path builder result expected.');
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.value.every(Object.isFrozen)).toBe(true);
    builder.moveTo(100, 100);
    expect(result.value).toEqual([move, line, arc, close]);
    expect(builder.finish()).toMatchObject({ status: 'invalid', diagnostic: { reason: 'BUILDER_SEALED' } });
  });

  const invalidBuilds: readonly [string, (builder: PathBuilder) => void][] = [
    ['BAD_PATH_GRAMMAR', builder => builder.close()],
    ['BAD_PATH_GRAMMAR', builder => builder.lineTo(1, 2)],
    ['NONFINITE', builder => builder.moveTo(Infinity, 0)],
    ['NONFINITE', builder => builder.moveTo(0, NaN)],
    ['BAD_ARC', builder => { builder.moveTo(0, 0); builder.arcTo(0, 0, 1, 1, 1); }],
    ['BAD_ARC', builder => { builder.moveTo(0, 0); builder.arcTo(1, 0, 1, 0, 0); }],
  ];
  it.each(invalidBuilds)('reports the first invalid command as %s', (reason, run) => {
    const builder = createPathBuilder();
    run(builder);
    builder.moveTo(2, 2);
    builder.lineTo(3, 3);
    expect(builder.finish()).toMatchObject({ status: 'invalid', diagnostic: { reason, path: 'path' } });
  });
});
