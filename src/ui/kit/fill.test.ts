import { describe, expect, it } from 'vitest';
import type { Fill, GradientStop } from '../../model/types';
import {
  FALLBACK_COLORS,
  MAX_MESH_POINTS,
  MAX_STOPS,
  addMeshPoint,
  addStop,
  colorAt,
  convertFill,
  describeFill,
  fillColors,
  fillToCss,
  moveStop,
  normalizeAngle,
  removeMeshPoint,
  removeStop,
  reverseStops,
  setStopColor,
  shadeOf,
  sortStops,
  sortStopsKeepSelection,
  stopsToCss,
  updateMeshPoint,
  type MeshFill,
} from './fill';

const S = (offset: number, color: string): GradientStop => ({ offset, color });
const linear: Fill = { type: 'linear', angle: 135, stops: [S(0, '#000000'), S(1, '#FFFFFF')] };
const mesh: MeshFill = {
  type: 'mesh',
  base: '#0E0B1C',
  points: [
    { x: 0.2, y: 0.2, color: '#7C6CFF', radius: 0.5 },
    { x: 0.8, y: 0.8, color: '#FF4D7E', radius: 0.4 },
  ],
};

describe('stops', () => {
  it('sorts stably by offset without mutating', () => {
    const a = S(0.5, '#111111');
    const b = S(0.5, '#222222');
    const c = S(0, '#333333');
    const input = [a, b, c];
    expect(sortStops(input)).toEqual([c, a, b]);
    expect(input).toEqual([a, b, c]);
  });

  it('interpolates the colour at an offset, alpha included', () => {
    const stops = [S(0, '#000000'), S(1, '#FFFFFF')];
    expect(colorAt(stops, 0.5)).toBe('#808080');
    expect(colorAt(stops, -1)).toBe('#000000');
    expect(colorAt(stops, 2)).toBe('#FFFFFF');
    expect(colorAt([S(1, '#FFFFFF'), S(0, '#000000')], 0.25)).toBe('#404040');
    expect(colorAt([S(0, '#FF000000'), S(1, '#FF0000')], 0.5)).toBe('#FF000080');
    expect(colorAt([], 0.5)).toBe('#000000');
    expect(colorAt([S(0.5, '#000000'), S(0.5, '#FFFFFF')], 0.5)).toBe('#000000');
  });

  it('adds a stop that keeps the look, returning sorted stops and its index', () => {
    const { stops, index } = addStop([S(1, '#FFFFFF'), S(0, '#000000')], 0.25);
    expect(index).toBe(1);
    expect(stops.map((s) => s.offset)).toEqual([0, 0.25, 1]);
    expect(stops[1].color).toBe('#404040');
  });

  it('clamps and rounds new offsets and refuses past MAX_STOPS', () => {
    expect(addStop([S(0, '#000000'), S(1, '#FFFFFF')], 1.5).stops.at(-1)?.offset).toBe(1);
    expect(addStop([S(0, '#000000'), S(1, '#FFFFFF')], 0.123456).stops[1].offset).toBe(0.123);
    const full = Array.from({ length: MAX_STOPS }, (_, i) => S(i / (MAX_STOPS - 1), '#000000'));
    expect(addStop(full, 0.5).index).toBe(-1);
    expect(addStop(full, 0.5).stops).toHaveLength(MAX_STOPS);
  });

  it('removes stops but never below two', () => {
    const three = [S(0, '#000000'), S(0.5, '#808080'), S(1, '#FFFFFF')];
    expect(removeStop(three, 1)).toEqual([three[0], three[2]]);
    expect(removeStop(removeStop(three, 1), 0)).toHaveLength(2);
    expect(removeStop(three, 7)).toEqual(three);
    expect(removeStop(three, -1)).toEqual(three);
  });

  it('moves a stop in place (no re-sort) and clamps', () => {
    const stops = [S(0, '#000000'), S(1, '#FFFFFF')];
    const moved = moveStop(stops, 0, 1.4);
    expect(moved.map((s) => s.offset)).toEqual([1, 1]);
    expect(moveStop(stops, 1, -3)[1].offset).toBe(0);
    expect(moveStop(stops, 1, Number.NaN)[1].offset).toBe(0);
    expect(moveStop(stops, 5, 0.5)).toEqual(stops);
  });

  it('recolours a stop with a normalized colour, ignoring invalid input', () => {
    const stops = [S(0, '#000000'), S(1, '#FFFFFF')];
    expect(setStopColor(stops, 1, 'f00')[1].color).toBe('#FF0000');
    expect(setStopColor(stops, 1, 'nope')).toEqual(stops);
  });

  it('keeps the selected stop selected through a sort', () => {
    const a = S(0.9, '#AAAAAA');
    const b = S(0.1, '#BBBBBB');
    const c = S(0.5, '#CCCCCC');
    const { stops, selected } = sortStopsKeepSelection([a, b, c], 0);
    expect(stops).toEqual([b, c, a]);
    expect(selected).toBe(2);
    expect(sortStopsKeepSelection([a, b], 9).selected).toBe(1);
  });

  it('reverses the gradient', () => {
    const reversed = reverseStops([S(0, '#000000'), S(0.3, '#808080'), S(1, '#FFFFFF')]);
    expect(reversed.map((s) => [s.offset, s.color])).toEqual([
      [0, '#FFFFFF'],
      [0.7, '#808080'],
      [1, '#000000'],
    ]);
  });
});

describe('normalizeAngle', () => {
  it('wraps into [0, 360) with two decimals', () => {
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(359.999)).toBe(0);
    expect(normalizeAngle(12.3456)).toBe(12.35);
    expect(normalizeAngle(Number.NaN)).toBe(0);
    expect(Object.is(normalizeAngle(-0), 0)).toBe(true);
  });
});

describe('CSS previews', () => {
  it('writes stop lists, doubling a lone stop', () => {
    expect(stopsToCss([S(1, '#fff'), S(0, '#000')])).toBe('#000000 0%, #FFFFFF 100%');
    expect(stopsToCss([S(0.5, '#ff0000')])).toBe('#FF0000 50%, #FF0000 50%');
    expect(stopsToCss([])).toBe('transparent, transparent');
  });

  it('renders solid and linear fills', () => {
    expect(fillToCss({ type: 'solid', color: '#ff8a3d' })).toEqual({ backgroundColor: '#FF8A3D' });
    expect(fillToCss({ ...linear, angle: -45 } as Fill).backgroundImage).toBe('linear-gradient(315deg, #000000 0%, #FFFFFF 100%)');
  });

  it('sizes radial gradients relative to the longer side of the box', () => {
    const radial: Fill = { type: 'radial', cx: 0.5, cy: 0.25, radius: 0.5, stops: [S(0, '#000'), S(1, '#fff')] };
    // On a 2:1 box the longer side is the width: rx = 50% of width, ry = 100% of height.
    expect(fillToCss(radial, 2).backgroundImage).toBe('radial-gradient(50% 100% at 50% 25%, #000000 0%, #FFFFFF 100%)');
    // On a 1:2 box the longer side is the height.
    expect(fillToCss(radial, 0.5).backgroundImage).toBe('radial-gradient(100% 50% at 50% 25%, #000000 0%, #FFFFFF 100%)');
    // Degenerate input stays valid CSS.
    expect(fillToCss({ ...radial, radius: Number.NaN } as Fill, 0).backgroundImage).toContain('radial-gradient(0.1% 0.1%');
  });

  it('layers mesh blobs over the base, last point on top, with a smooth falloff', () => {
    const css = fillToCss(mesh, 1);
    expect(css.backgroundColor).toBe('#0E0B1C');
    const layers = css.backgroundImage?.split('radial-gradient(').filter(Boolean) ?? [];
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('at 80% 80%');
    expect(layers[0]).toContain('#FF4D7E 0%');
    expect(layers[0]).toContain('#FF4D7E80 50%');
    expect(layers[0]).toContain('#FF4D7E00 100%');
    expect(fillToCss({ ...mesh, points: [] })).toEqual({ backgroundColor: '#0E0B1C' });
  });

  it('leaves image fills to the preview component', () => {
    expect(fillToCss({ type: 'image', assetId: 'x', fit: 'cover', opacity: 1, blur: 0, tint: null })).toEqual({});
  });

  it('describes fills for assistive tech', () => {
    expect(describeFill({ type: 'solid', color: '#fff' })).toBe('Solid #FFFFFF');
    expect(describeFill(linear)).toBe('Linear gradient, 2 stops, 135°');
    expect(describeFill({ ...mesh, points: [mesh.points[0]] })).toBe('Mesh gradient, 1 point');
    expect(describeFill(mesh)).toBe('Mesh gradient, 2 points');
  });
});

describe('convertFill', () => {
  it('returns the same fill for the same type', () => {
    expect(convertFill(linear, 'linear')).toBe(linear);
  });

  it('solid -> gradients gets a companion colour (palette first)', () => {
    const solid: Fill = { type: 'solid', color: '#7C6CFF' };
    const lin = convertFill(solid, 'linear', { palette: ['#7c6cff', '#FF4D7E'] });
    expect(lin).toEqual({ type: 'linear', angle: 180, stops: [S(0, '#7C6CFF'), S(1, '#FF4D7E')] });
    const rad = convertFill(solid, 'radial');
    expect(rad?.type).toBe('radial');
    if (rad?.type === 'radial') {
      expect(rad.stops[0].color).toBe('#7C6CFF');
      expect(rad.stops[1].color).toBe(shadeOf('#7C6CFF'));
      expect([rad.cx, rad.cy, rad.radius]).toEqual([0.5, 0.5, 0.75]);
    }
  });

  it('gradient <-> gradient keeps the stops', () => {
    const rad = convertFill(linear, 'radial');
    expect(rad?.type === 'radial' && rad.stops).toEqual(linear.type === 'linear' && linear.stops);
  });

  it('gradient -> solid takes the first stop', () => {
    expect(convertFill(linear, 'solid')).toEqual({ type: 'solid', color: '#000000' });
  });

  it('-> mesh builds an aurora with at least two blobs', () => {
    const m = convertFill({ type: 'solid', color: '#0E0B1C' }, 'mesh', { palette: ['#0E0B1C'] });
    expect(m?.type).toBe('mesh');
    if (m?.type === 'mesh') {
      expect(m.base).toBe('#0E0B1C');
      expect(m.points).toHaveLength(2);
      expect(m.points.map((p) => p.color)).toEqual([FALLBACK_COLORS[0], FALLBACK_COLORS[1]]);
      for (const p of m.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
      }
    }
    const fromLinear = convertFill({ type: 'linear', angle: 0, stops: [S(0, '#111111'), S(0.5, '#222222'), S(1, '#333333')] }, 'mesh');
    expect(fromLinear?.type === 'mesh' && fromLinear.points.map((p) => p.color)).toEqual(['#222222', '#333333']);
  });

  it('mesh -> gradient uses the base and blob colours', () => {
    const lin = convertFill(mesh, 'linear');
    expect(lin?.type === 'linear' && lin.stops).toEqual([S(0, '#0E0B1C'), S(0.5, '#7C6CFF'), S(1, '#FF4D7E')]);
  });

  it('-> image needs an asset', () => {
    expect(convertFill(linear, 'image')).toBeNull();
    expect(convertFill(linear, 'image', { assetId: 'abc.png' })).toEqual({
      type: 'image',
      assetId: 'abc.png',
      fit: 'cover',
      opacity: 1,
      blur: 0,
      tint: null,
    });
  });

  it('image -> colour fills fall back to the tint or a default', () => {
    const tinted: Fill = { type: 'image', assetId: 'a', fit: 'tile', opacity: 0.5, blur: 0, tint: '#11223380' };
    expect(fillColors(tinted)).toEqual(['#112233']);
    expect(convertFill(tinted, 'solid')).toEqual({ type: 'solid', color: '#112233' });
    const plain: Fill = { ...tinted, tint: null };
    expect(convertFill(plain, 'solid')).toEqual({ type: 'solid', color: '#FFFFFF' });
    const lin = convertFill(plain, 'linear');
    expect(lin?.type === 'linear' && lin.stops[0].color).toBe(FALLBACK_COLORS[0]);
  });
});

describe('mesh points', () => {
  it('adds the first point at a pleasing spot and later ones far from the rest', () => {
    const empty: MeshFill = { type: 'mesh', base: '#000000', points: [] };
    const one = addMeshPoint(empty);
    expect(one).toHaveLength(1);
    expect([one[0].x, one[0].y]).toEqual([0.2, 0.18]);
    const next = addMeshPoint(mesh);
    const added = next[2];
    expect((added.x === 0.9 && added.y === 0.1) || (added.x === 0.1 && added.y === 0.9)).toBe(true);
    expect(added.radius).toBe(0.5);
  });

  it('picks an unused palette colour, then fallbacks', () => {
    const next = addMeshPoint(mesh, ['#7C6CFF', '#3DD6C8']);
    expect(next[2].color).toBe('#3DD6C8');
    const noPalette = addMeshPoint(mesh);
    expect(noPalette[2].color).toBe(FALLBACK_COLORS[0]);
  });

  it('is deterministic and capped', () => {
    expect(addMeshPoint(mesh)).toEqual(addMeshPoint(mesh));
    let m: MeshFill = { ...mesh, points: [] };
    for (let i = 0; i < MAX_MESH_POINTS + 3; i++) m = { ...m, points: addMeshPoint(m) };
    expect(m.points).toHaveLength(MAX_MESH_POINTS);
  });

  it('removes and updates with clamping', () => {
    expect(removeMeshPoint(mesh.points, 0)).toEqual([mesh.points[1]]);
    expect(removeMeshPoint(mesh.points, 9)).toEqual(mesh.points);
    const updated = updateMeshPoint(mesh.points, 0, { x: 2, y: -1, radius: 9, color: 'abc' });
    expect(updated[0]).toEqual({ x: 1, y: 0, radius: 1.5, color: '#AABBCC' });
    expect(updateMeshPoint(mesh.points, 0, { radius: Number.NaN, color: 'nope' })[0]).toEqual(mesh.points[0]);
    expect(updateMeshPoint(mesh.points, 0, { radius: 0 })[0].radius).toBe(0.02);
    expect(updateMeshPoint(mesh.points, -1, { x: 0 })).toEqual(mesh.points);
  });
});
